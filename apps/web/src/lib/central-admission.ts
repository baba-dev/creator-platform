import { createHash } from "node:crypto";
import { db } from "@aiwa/db";
import { rateLimit } from "./rate-limit";
import { NextResponse } from "next/server";

const MAX_PENDING_JOBS_PER_USER = 5;
const MAX_PENDING_JOBS_PER_ORG = 20;

const actorRateLimiter = rateLimit({
  max: 15,
  windowMs: 60_000,
  prefix: "gen:actor",
});

const orgRateLimiter = rateLimit({
  max: 45,
  windowMs: 60_000,
  prefix: "gen:org",
});

export interface AdmissionOptions {
  userId: string;
  organizationId: string;
  idempotencyKey: string;
  /** Pass true if this request is known to be an idempotent replay */
  isReplay?: boolean;
}

/**
 * Centrally validates actor rate, organization rate, and pending concurrent job
 * quotas before admitting any new generation job (image, video, text, voice, or zero-cost).
 * Idempotent replays are exempted from rate limits and concurrency budgets.
 */
export async function assertGenerationAdmission(
  options: AdmissionOptions,
): Promise<NextResponse | null> {
  const { userId, organizationId, idempotencyKey, isReplay } = options;

  // 1. Idempotent replay exemption
  if (isReplay) {
    return null;
  }

  // Also check if this exact idempotency key was already committed to DB
  const transportHash = createHash("sha256")
    .update(`${organizationId}:${userId}:${idempotencyKey}`)
    .digest("hex");

  const existing = await db.generationJob.findFirst({
    where: {
      OR: [{ idempotencyKey }, { idempotencyKey: transportHash }],
    },
    select: { id: true },
  });

  if (existing) {
    // Exact replay of an admitted job; exempt from rate and quota admission checks
    return null;
  }

  // 2. Actor new-job rate limit
  const actorLimited = await actorRateLimiter.check(userId);
  if (actorLimited) return actorLimited;

  // 3. Organization new-job rate limit
  const orgLimited = await orgRateLimiter.check(organizationId);
  if (orgLimited) return orgLimited;

  // 4. Pending concurrent jobs quota (applied equally to paid and zero-cost models)
  const [userPendingCount, orgPendingCount] = await Promise.all([
    db.generationJob.count({
      where: {
        createdById: userId,
        status: { in: ["QUEUED", "SUBMITTED", "PROCESSING"] },
      },
    }),
    db.generationJob.count({
      where: {
        organizationId,
        status: { in: ["QUEUED", "SUBMITTED", "PROCESSING"] },
      },
    }),
  ]);

  if (userPendingCount >= MAX_PENDING_JOBS_PER_USER) {
    return NextResponse.json(
      {
        error: `Concurrent generation quota reached (${userPendingCount}/${MAX_PENDING_JOBS_PER_USER} active). Please wait for an active job to finish before submitting another.`,
        code: "CONCURRENT_QUOTA_EXCEEDED",
      },
      { status: 429 },
    );
  }

  if (orgPendingCount >= MAX_PENDING_JOBS_PER_ORG) {
    return NextResponse.json(
      {
        error: `Workspace concurrent generation quota reached (${orgPendingCount}/${MAX_PENDING_JOBS_PER_ORG} active). Please wait for active workspace jobs to finish.`,
        code: "WORKSPACE_QUOTA_EXCEEDED",
      },
      { status: 429 },
    );
  }

  return null;
}
