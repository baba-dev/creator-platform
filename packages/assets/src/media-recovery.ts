import { hasOrganizationPermission, hasPlatformPermission } from "@aiwa/authz";
import { db, type Prisma } from "@aiwa/db";
import {
  derivativeKinds,
  expectedDerivatives,
  type DerivativeKind,
} from "./media-status";
export class MediaRecoveryError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "STATE_CHANGED" | "RETRY_LIMIT",
  ) {
    super(code);
  }
}
async function lockTask(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM MediaTask WHERE id = ${id} FOR UPDATE`;
  const task = await tx.mediaTask.findUnique({ where: { id } });
  if (!task) throw new MediaRecoveryError("NOT_FOUND");
  return task;
}
async function databaseNow(tx: Prisma.TransactionClient): Promise<Date> {
  const rows = await tx.$queryRaw<
    { now: Date }[]
  >`SELECT UTC_TIMESTAMP(3) AS now`;
  return rows[0]!.now;
}
export async function retryMediaTask(
  id: string,
  stoppedConfirmed = false,
  request?: {
    actorUserId: string;
    expectedCycle: number;
    organizationId?: string;
    assetId?: string;
  },
): Promise<void> {
  await db.$transaction(async (tx) => {
    const task = await lockTask(tx, id);
    const now = await databaseNow(tx);
    if (request) {
      if (
        (request.organizationId &&
          task.organizationId !== request.organizationId) ||
        (request.assetId && task.targetId !== request.assetId) ||
        !derivativeKinds.includes(task.kind as DerivativeKind)
      )
        throw new MediaRecoveryError("NOT_FOUND");
      if (task.cycle !== request.expectedCycle || task.status !== "FAILED")
        throw new MediaRecoveryError("STATE_CHANGED");
      if (task.cycle >= 3) throw new MediaRecoveryError("RETRY_LIMIT");
    }
    const expired =
      task.status === "PROCESSING" && task.leaseUntil && task.leaseUntil <= now;
    if (task.status !== "FAILED" && task.status !== "REVIEW" && !expired)
      throw new Error("Task is not eligible for recovery.");
    if ((task.status === "REVIEW" || expired) && !stoppedConfirmed)
      throw new Error("Confirm old processes stopped before recovery.");
    if (["IMAGE_EDIT", "VIDEO_RENDER"].includes(task.kind))
      throw new Error(
        "Create a new edit/export after resolving its previous execution.",
      );
    if (request) {
      if (request.organizationId) {
        const membership = await tx.membership.findUnique({
          where: {
            organizationId_userId: {
              organizationId: request.organizationId,
              userId: request.actorUserId,
            },
          },
          include: { organization: { select: { status: true } } },
        });
        if (
          !membership ||
          membership.organization.status !== "ACTIVE" ||
          !hasOrganizationPermission(membership.role, "assets:manage")
        )
          throw new MediaRecoveryError("NOT_FOUND");
      } else {
        const actor = await tx.user.findUnique({
          where: { id: request.actorUserId },
          select: { platformRole: true, disabledAt: true },
        });
        if (
          !actor ||
          actor.disabledAt ||
          !hasPlatformPermission(actor.platformRole, "jobs:manage")
        )
          throw new MediaRecoveryError("NOT_FOUND");
      }
    }
    const rows = await tx.$queryRaw<
      {
        id: string;
        organizationId: string;
        status: string;
        storageProvider: string;
        purpose: string;
        storageOwnerUserId: string | null;
        mediaKind: string;
      }[]
    >`SELECT id, organizationId, status, storageProvider, purpose, storageOwnerUserId, mediaKind FROM Asset WHERE id = ${task.targetId} FOR UPDATE`;
    const asset = rows[0];
    if (
      !asset ||
      asset.organizationId !== task.organizationId ||
      asset.status !== "READY" ||
      asset.storageProvider !== "LOCAL"
    )
      throw new Error("Asset is unavailable.");
    if (
      request &&
      (!expectedDerivatives(asset.mediaKind).includes(
        task.kind as DerivativeKind,
      ) ||
        (await tx.assetVariant.findFirst({
          where: { assetId: asset.id, kind: task.kind as DerivativeKind },
          select: { id: true },
        })))
    )
      throw new MediaRecoveryError("STATE_CHANGED");
    if (
      request &&
      asset.purpose === "REFERENCE_INPUT" &&
      request.organizationId &&
      asset.storageOwnerUserId !== request.actorUserId
    )
      throw new MediaRecoveryError("NOT_FOUND");
    await tx.auditEvent.create({
      data: {
        actorUserId: request?.actorUserId,
        organizationId: task.organizationId,
        action: "media.task_retry_requested",
        targetType: "MediaTask",
        targetId: id,
        metadata: {
          source: request ? "web" : "creator-ops",
          previousCycle: task.cycle,
          previousAttempts: task.attemptCount,
          previousFence: task.fence,
          stoppedConfirmed,
        },
      },
    });
    await tx.mediaTaskAttempt.updateMany({
      where: { taskId: id, finishedAt: null },
      data: { outcome: "REVOKED", finishedAt: now },
    });
    await tx.mediaTask.update({
      where: { id },
      data: {
        cycle: { increment: 1 },
        fence: { increment: 1 },
        attemptCount: 0,
        status: "PENDING",
        owner: null,
        leaseUntil: null,
        nextAttemptAt: null,
        errorCode: null,
      },
    });
  });
}
