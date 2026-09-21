import { hasOrganizationPermission } from "@aiwa/authz";
import { db, Prisma } from "@aiwa/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const DEFAULT_NVIDIA_REASONING_MODEL =
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
const MAX_ACTIVE_REASONING_JOBS_PER_USER = 3;
const MAX_REASONING_JOBS_PER_HOUR = 60;
function promptEnhancementSystemPrompt(targetMedia: "IMAGE" | "VIDEO") {
  return [
    `You are an expert creative director for AI ${targetMedia === "VIDEO" ? "video" : "image"} generation.`,
    targetMedia === "VIDEO"
      ? "Improve the prompt with concrete subject, action, composition, shot progression, camera movement, lighting, atmosphere, pacing, and style details when useful."
      : "Improve the prompt with concrete subject, composition, lighting, lens or camera language, atmosphere, materials, and style details when useful.",
    "Preserve the user's intent and factual constraints. Do not add unrelated subjects, brands, people, claims, text, or sensitive attributes.",
    'Return only one JSON object with exactly one string property named "enhancedPrompt". Do not use markdown fences or commentary.',
    "Keep enhancedPrompt at or below 2000 characters.",
  ].join(" ");
}

const requestSchema = z.object({
  organizationId: z.string().min(1),
  userPrompt: z.string().trim().min(1).max(2000),
  targetMedia: z.enum(["IMAGE", "VIDEO"]),
  idempotencyKey: z.uuid(),
});

function failure(error: unknown) {
  const status =
    error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 503;
  return NextResponse.json(
    {
      error:
        status === 400
          ? "Invalid prompt enhancement request."
          : "Prompt enhancement service unavailable.",
    },
    { status },
  );
}

function supportsPromptEnhancement(capabilities: unknown): boolean {
  if (!capabilities || typeof capabilities !== "object") return false;
  return (
    (capabilities as Record<string, unknown>)["task:prompt-enhancement"] ===
    true
  );
}

async function existingResponse(
  idempotencyKey: string,
  organizationId: string,
  userPrompt: string,
  targetMedia: "IMAGE" | "VIDEO",
) {
  const existing = await db.reasoningJob.findUnique({
    where: { idempotencyKey },
  });
  if (!existing) return null;

  const payload = existing.requestPayload as {
    task?: unknown;
    userPrompt?: unknown;
    targetMedia?: unknown;
  };
  if (
    existing.organizationId !== organizationId ||
    payload.task !== "prompt-enhancement" ||
    payload.userPrompt !== userPrompt ||
    payload.targetMedia !== targetMedia
  )
    return NextResponse.json(
      { error: "Idempotency key was already used for different inputs." },
      { status: 409 },
    );

  return NextResponse.json(
    { jobId: existing.id, status: existing.status },
    { status: 202 },
  );
}

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });

  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  if (!process.env.NVIDIA_API_KEY)
    return NextResponse.json(
      { error: "Prompt enhancement is not configured." },
      { status: 503 },
    );

  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 6000)
      return NextResponse.json(
        { error: "Request too large." },
        { status: 413 },
      );

    const parsed = requestSchema.parse(JSON.parse(text));
    const membership = await db.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: parsed.organizationId,
          userId: session.user.id,
        },
      },
      select: {
        role: true,
        organization: { select: { status: true } },
      },
    });

    if (
      !membership ||
      membership.organization.status !== "ACTIVE" ||
      !hasOrganizationPermission(membership.role, "generation:create")
    )
      return NextResponse.json({ error: "Access denied." }, { status: 403 });

    const configuredModel =
      process.env.NVIDIA_REASONING_MODEL || DEFAULT_NVIDIA_REASONING_MODEL;
    const providerModel = await db.providerModel.findUnique({
      where: {
        provider_providerModelId: {
          provider: "NVIDIA",
          providerModelId: configuredModel,
        },
      },
    });

    if (
      !providerModel ||
      providerModel.mediaKind !== "REASONING" ||
      !providerModel.enabled ||
      !supportsPromptEnhancement(providerModel.capabilities)
    )
      return NextResponse.json(
        { error: "NVIDIA prompt enhancement model is not enabled." },
        { status: 503 },
      );

    const idempotencyKey = `reasoning:${session.user.id}:${parsed.idempotencyKey}`;
    const previous = await existingResponse(
      idempotencyKey,
      parsed.organizationId,
      parsed.userPrompt,
      parsed.targetMedia,
    );
    if (previous) return previous;

    const [activeJobs, recentJobs] = await Promise.all([
      db.reasoningJob.count({
        where: {
          createdById: session.user.id,
          organizationId: parsed.organizationId,
          status: { in: ["QUEUED", "PROCESSING"] },
        },
      }),
      db.reasoningJob.count({
        where: {
          createdById: session.user.id,
          organizationId: parsed.organizationId,
          createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
        },
      }),
    ]);
    if (recentJobs >= MAX_REASONING_JOBS_PER_HOUR)
      return NextResponse.json(
        {
          error: "Prompt enhancement hourly limit reached. Try again later.",
        },
        { status: 429, headers: { "Retry-After": "60" } },
      );

    if (activeJobs >= MAX_ACTIVE_REASONING_JOBS_PER_USER)
      return NextResponse.json(
        {
          error:
            "Too many prompt enhancements are already running. Wait for one to finish.",
        },
        { status: 429, headers: { "Retry-After": "5" } },
      );

    try {
      const job = await db.$transaction(async (tx) => {
        const created = await tx.reasoningJob.create({
          data: {
            organizationId: parsed.organizationId,
            createdById: session.user.id,
            providerModelId: providerModel.id,
            status: "QUEUED",
            queuedAt: new Date(),
            idempotencyKey,
            requestPayload: {
              task: "prompt-enhancement",
              systemPrompt: promptEnhancementSystemPrompt(parsed.targetMedia),
              userPrompt: parsed.userPrompt,
              targetMedia: parsed.targetMedia,
              responseSchemaName: "prompt-enhancement-v1",
            },
          },
        });

        await tx.auditEvent.create({
          data: {
            organizationId: parsed.organizationId,
            actorUserId: session.user.id,
            action: "reasoning.queued",
            targetType: "ReasoningJob",
            targetId: created.id,
            metadata: { task: "prompt-enhancement" },
          },
        });
        return created;
      });

      return NextResponse.json(
        { jobId: job.id, status: job.status },
        { status: 202 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const raced = await existingResponse(
          idempotencyKey,
          parsed.organizationId,
          parsed.userPrompt,
          parsed.targetMedia,
        );
        if (raced) return raced;
      }
      throw error;
    }
  } catch (error) {
    return failure(error);
  }
}
