import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { db, Prisma } from "@aiwa/db";

export type MediaTaskKind =
  | "THUMBNAIL"
  | "PREVIEW"
  | "POSTER"
  | "STORYBOARD"
  | "WAVEFORM"
  | "IMAGE_EDIT"
  | "VIDEO_RENDER";
const leaseMs = 300_000;
const capacityId = "native-media-v1";
type Claim = { id: string; owner: string; fence: number };
const ownership = new AsyncLocalStorage<Claim>();
export class MediaOwnershipLost extends Error {
  constructor() {
    super("Media ownership is unavailable; operator review required.");
    this.name = "MediaOwnershipLost";
  }
}
export class MediaPermanentFailure extends Error {
  constructor() {
    super("Media input is unavailable or invalid.");
    this.name = "MediaPermanentFailure";
  }
}
export function classifyMediaFailure(error: unknown) {
  if (
    error instanceof MediaPermanentFailure ||
    (error instanceof Error && error.name === "ZodError")
  )
    return { code: "INVALID_MEDIA_INPUT", permanent: true };
  if (error instanceof Error && error.message.includes("MEDIA_TIMEOUT"))
    return { code: "MEDIA_TIMEOUT", permanent: false };
  if (error instanceof Error && error.message.includes("MEDIA_OUTPUT_LIMIT"))
    return { code: "MEDIA_OUTPUT_LIMIT", permanent: true };
  return { code: "PROCESSING_FAILED", permanent: false };
}
async function lockTask(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM MediaTask WHERE id = ${id} FOR UPDATE`;
  return tx.mediaTask.findUniqueOrThrow({ where: { id } });
}
async function lockCapacity(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT id FROM MediaCapacity WHERE id = ${capacityId} FOR UPDATE`;
  return tx.mediaCapacity.findUniqueOrThrow({ where: { id: capacityId } });
}
async function databaseNow(tx: Prisma.TransactionClient): Promise<Date> {
  const rows = await tx.$queryRaw<
    { now: Date }[]
  >`SELECT UTC_TIMESTAMP(3) AS now`;
  return rows[0]!.now;
}
export async function ensureMediaTask(input: {
  targetId: string;
  organizationId: string;
  kind: MediaTaskKind;
  legacyAttempts?: number;
  legacyFailed?: boolean;
}) {
  const attempts = Math.max(0, Math.min(3, input.legacyAttempts ?? 0));
  const taskKey = `${input.targetId}:${input.kind}:v1`;
  try {
    return await db.mediaTask.upsert({
      where: { taskKey },
      create: {
        taskKey,
        targetId: input.targetId,
        organizationId: input.organizationId,
        kind: input.kind,
        attemptCount: input.legacyFailed ? 3 : attempts,
        status: input.legacyFailed || attempts >= 3 ? "FAILED" : "PENDING",
        errorCode: input.legacyFailed ? "LEGACY_ATTEMPTS_EXHAUSTED" : null,
      },
      update: {},
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      return db.mediaTask.findUniqueOrThrow({ where: { taskKey } });
    throw error;
  }
}
export async function claimMediaTask(id: string): Promise<Claim | null> {
  return db.$transaction(async (tx) => {
    const task = await lockTask(tx, id);
    const now = await databaseNow(tx);
    if (task.status === "PROCESSING") {
      if (!task.leaseUntil || task.leaseUntil <= now)
        await tx.mediaTask.update({
          where: { id },
          data: { status: "REVIEW", errorCode: "LEASE_EXPIRED" },
        });
      return null;
    }
    if (
      !["PENDING", "RETRY_WAIT"].includes(task.status) ||
      (task.nextAttemptAt && task.nextAttemptAt > now)
    )
      return null;
    if (task.attemptCount >= task.maxAttempts) {
      await tx.mediaTask.update({
        where: { id },
        data: { status: "FAILED", errorCode: "ATTEMPTS_EXHAUSTED" },
      });
      return null;
    }
    const claim = { id, owner: randomUUID(), fence: task.fence + 1 };
    await tx.mediaTask.update({
      where: { id },
      data: {
        status: "PROCESSING",
        owner: claim.owner,
        fence: claim.fence,
        attemptCount: { increment: 1 },
        leaseUntil: new Date(now.getTime() + leaseMs),
        nextAttemptAt: null,
      },
    });
    await tx.mediaTaskAttempt.create({
      data: {
        taskId: id,
        cycle: task.cycle,
        number: task.attemptCount + 1,
        fence: claim.fence,
        startedAt: now,
      },
    });
    return claim;
  });
}
export async function assertMediaOwnership(
  tx: Prisma.TransactionClient,
): Promise<void> {
  const claim = ownership.getStore();
  if (!claim) return;
  const task = await lockTask(tx, claim.id);
  const now = await databaseNow(tx);
  if (
    task.status !== "PROCESSING" ||
    task.owner !== claim.owner ||
    task.fence !== claim.fence ||
    !task.leaseUntil ||
    task.leaseUntil <= now
  )
    throw new MediaOwnershipLost();
}
export async function completeMediaTask(tx: Prisma.TransactionClient) {
  const claim = ownership.getStore();
  if (!claim) return;
  await assertMediaOwnership(tx);
  await tx.mediaTask.update({
    where: { id: claim.id },
    data: {
      status: "SUCCEEDED",
      owner: null,
      leaseUntil: null,
      errorCode: null,
    },
  });
  await tx.mediaTaskAttempt.updateMany({
    where: { taskId: claim.id, fence: claim.fence },
    data: { outcome: "SUCCEEDED", finishedAt: new Date() },
  });
}
export async function renewMediaTask(claim: Claim): Promise<void> {
  await db.$transaction(async (tx) => {
    const task = await lockTask(tx, claim.id);
    const now = await databaseNow(tx);
    if (task.status === "SUCCEEDED") return;
    if (
      task.status !== "PROCESSING" ||
      task.owner !== claim.owner ||
      task.fence !== claim.fence ||
      !task.leaseUntil ||
      task.leaseUntil <= now
    )
      throw new MediaOwnershipLost();
    await tx.mediaTask.update({
      where: { id: claim.id },
      data: { leaseUntil: new Date(now.getTime() + leaseMs) },
    });
  });
}
function heartbeat(renew: () => Promise<void>) {
  let pending = Promise.resolve();
  let busy = false;
  let lost = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    pending = renew()
      .catch(() => {
        lost = true;
      })
      .finally(() => {
        busy = false;
      });
  }, 15_000);
  timer.unref();
  return {
    lost: () => lost,
    stop: async () => {
      clearInterval(timer);
      await pending;
    },
  };
}
export async function runMediaTask(
  id: string,
  execute: () => Promise<void>,
): Promise<boolean> {
  const claim = await claimMediaTask(id);
  if (!claim) return false;
  const pulse = heartbeat(() => renewMediaTask(claim));
  try {
    await ownership.run(claim, async () => {
      await execute();
      if (pulse.lost()) throw new MediaOwnershipLost();
      await db.$transaction(async (tx) => {
        const task = await lockTask(tx, id);
        if (task.status !== "SUCCEEDED") await completeMediaTask(tx);
      });
    });
    return true;
  } catch (error) {
    await db.$transaction(async (tx) => {
      const task = await lockTask(tx, id);
      if (
        task.status !== "PROCESSING" ||
        task.owner !== claim.owner ||
        task.fence !== claim.fence
      )
        return;
      const now = await databaseNow(tx);
      const lost =
        pulse.lost() ||
        error instanceof MediaOwnershipLost ||
        !task.leaseUntil ||
        task.leaseUntil <= now;
      const classification = classifyMediaFailure(error);
      const exhausted =
        classification.permanent || task.attemptCount >= task.maxAttempts;
      const code = lost ? "OWNERSHIP_LOST" : classification.code;
      await tx.mediaTask.update({
        where: { id },
        data: {
          status: lost ? "REVIEW" : exhausted ? "FAILED" : "RETRY_WAIT",
          errorCode: code,
          ...(lost ? {} : { owner: null, leaseUntil: null }),
          nextAttemptAt:
            lost || exhausted
              ? null
              : new Date(
                  now.getTime() +
                    30_000 * 2 ** (task.attemptCount - 1) +
                    Math.floor(Math.random() * 5000),
                ),
        },
      });
      await tx.mediaTaskAttempt.updateMany({
        where: { taskId: id, fence: claim.fence },
        data: {
          outcome: lost ? "REVIEW" : "FAILED",
          errorCode: code,
          finishedAt: now,
        },
      });
    });
    return false;
  } finally {
    await pulse.stop();
  }
}
export async function withDatabaseMediaCapacity<T>(
  execute: () => Promise<T>,
): Promise<T> {
  try {
    await db.mediaCapacity.upsert({
      where: { id: capacityId },
      create: { id: capacityId },
      update: {},
    });
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    )
      throw error;
  }
  const owner = randomUUID();
  let fence: number | null = null;
  while (fence === null) {
    fence = await db.$transaction(async (tx) => {
      const row = await lockCapacity(tx);
      const now = await databaseNow(tx);
      if (row.owner) {
        if (!row.leaseUntil || row.leaseUntil <= now)
          throw new MediaOwnershipLost();
        return null;
      }
      await tx.mediaCapacity.update({
        where: { id: capacityId },
        data: {
          owner,
          fence: { increment: 1 },
          leaseUntil: new Date(now.getTime() + leaseMs),
        },
      });
      return row.fence + 1;
    });
    if (fence === null) await delay(1000);
  }
  const pulse = heartbeat(async () => {
    await db.$transaction(async (tx) => {
      const row = await lockCapacity(tx);
      const now = await databaseNow(tx);
      if (
        row.owner !== owner ||
        row.fence !== fence ||
        !row.leaseUntil ||
        row.leaseUntil <= now
      )
        throw new MediaOwnershipLost();
      await tx.mediaCapacity.update({
        where: { id: capacityId },
        data: { leaseUntil: new Date(now.getTime() + leaseMs) },
      });
    });
  });
  try {
    const result = await execute();
    if (pulse.lost()) throw new MediaOwnershipLost();
    return result;
  } finally {
    await pulse.stop();
    await db.mediaCapacity.updateMany({
      where: { id: capacityId, owner, fence },
      data: { owner: null, leaseUntil: null },
    });
  }
}
export async function reviewExpiredMediaTasks(): Promise<void> {
  await db.$executeRaw`UPDATE MediaTask SET status = 'REVIEW', errorCode = 'LEASE_EXPIRED' WHERE status = 'PROCESSING' AND leaseUntil <= UTC_TIMESTAMP(3)`;
}
export async function recoverMediaCapacity(): Promise<void> {
  await db.$transaction(async (tx) => {
    const row = await lockCapacity(tx);
    const now = await databaseNow(tx);
    if (!row.owner || (row.leaseUntil && row.leaseUntil > now))
      throw new Error("Only expired media capacity can be recovered.");
    await tx.auditEvent.create({
      data: {
        action: "media.capacity_recovered",
        targetType: "MediaCapacity",
        targetId: capacityId,
        metadata: {
          source: "creator-ops",
          oldFence: row.fence,
          processesStoppedConfirmed: true,
        },
      },
    });
    await tx.mediaTask.updateMany({
      where: { status: "PROCESSING" },
      data: { status: "REVIEW", errorCode: "CAPACITY_RECOVERED" },
    });
    await tx.mediaCapacity.update({
      where: { id: capacityId },
      data: { owner: null, leaseUntil: null, fence: { increment: 1 } },
    });
  });
}
export { retryMediaTask } from "@aiwa/assets/media-recovery";
export async function abandonMediaTask(id: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const task = await lockTask(tx, id);
    const now = await databaseNow(tx);
    const expired =
      task.status === "PROCESSING" && task.leaseUntil && task.leaseUntil <= now;
    if (task.status !== "REVIEW" && !expired)
      throw new Error("Only lost ownership can be abandoned.");
    await tx.auditEvent.create({
      data: {
        organizationId: task.organizationId,
        action: "media.task_abandoned",
        targetType: "MediaTask",
        targetId: id,
        metadata: {
          source: "creator-ops",
          previousFence: task.fence,
          processesStoppedConfirmed: true,
        },
      },
    });
    await tx.mediaTaskAttempt.updateMany({
      where: { taskId: id, finishedAt: null },
      data: { outcome: "ABANDONED", finishedAt: now },
    });
    await tx.mediaTask.update({
      where: { id },
      data: {
        status: "FAILED",
        fence: { increment: 1 },
        owner: null,
        leaseUntil: null,
        errorCode: "OPERATOR_ABANDONED",
      },
    });
  });
}
export async function recordMediaOutput(objectKey: string): Promise<void> {
  const claim = ownership.getStore();
  if (!claim) return;
  await db.$transaction(async (tx) => {
    await assertMediaOwnership(tx);
    await tx.mediaTaskAttempt.updateMany({
      where: { taskId: claim.id, fence: claim.fence },
      data: { outputObjectKey: objectKey },
    });
  });
}
