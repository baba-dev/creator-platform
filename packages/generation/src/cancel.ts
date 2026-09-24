import {
  hasOrganizationPermission,
  hasPlatformPermission,
  type PlatformRole,
} from "@aiwa/authz";
import { releaseOrRefundCredits } from "@aiwa/credits";
import { db } from "@aiwa/db";

export class CancelGenerationError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function cancelQueuedGenerationJob(input: {
  jobId: string;
  actorUserId: string;
  platformRole: PlatformRole;
  idempotencyKey: string;
}) {
  return db.$transaction(async (tx) => {
    // The worker's QUEUED -> SUBMITTED claim and this transition serialize on
    // the same row. Never cancel a job that may have reached the provider.
    await tx.$queryRaw`SELECT id FROM GenerationJob WHERE id = ${input.jobId} FOR UPDATE`;
    const job = await tx.generationJob.findUnique({
      where: { id: input.jobId },
    });
    if (!job) throw new CancelGenerationError("Job not found.", 404);

    const membership = await tx.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: job.organizationId,
          userId: input.actorUserId,
        },
      },
      include: { organization: true, user: true },
    });
    const canManage = hasPlatformPermission(input.platformRole, "jobs:manage");
    const canCancel =
      membership &&
      !membership.user.disabledAt &&
      membership.user.emailVerified &&
      membership.organization.status === "ACTIVE" &&
      hasOrganizationPermission(membership.role, "generation:cancel") &&
      (job.createdById === input.actorUserId ||
        membership.role === "ORGANIZATION_OWNER");
    if (!canManage && !canCancel)
      throw new CancelGenerationError("Job not found.", 404);
    if (job.status === "CANCELLED") return { status: "CANCELLED" as const };
    if (job.status !== "QUEUED")
      throw new CancelGenerationError(
        "This job has already started. Its provider outcome must be checked before credits can be released.",
        409,
      );
    if (job.chargedCredits !== 0n || job.providerRequestId)
      throw new CancelGenerationError("Job needs administrative review.", 409);

    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { organizationId: job.organizationId },
    });
    const capture = await tx.ledgerEntry.findFirst({
      where: {
        walletId: wallet.id,
        referenceType: "GENERATION_JOB",
        referenceId: job.id,
        type: "CAPTURE",
      },
      select: { id: true },
    });
    if (capture)
      throw new CancelGenerationError("Job needs administrative review.", 409);
    await releaseOrRefundCredits(tx, {
      walletId: wallet.id,
      jobId: job.id,
      reason: "Cancelled before provider submission.",
      idempotencyKey: `generation-release-${job.id}`,
    });
    await tx.asset.updateMany({
      where: { generationJobId: job.id, status: "PENDING" },
      data: { status: "DELETED", byteSize: 0n },
    });
    await tx.generationJob.update({
      where: { id: job.id },
      data: {
        status: "CANCELLED",
        completedAt: new Date(),
        errorCode: null,
        errorMessage: null,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        organizationId: job.organizationId,
        action: "generation.cancelled",
        targetType: "GenerationJob",
        targetId: job.id,
        metadata: { idempotencyKey: input.idempotencyKey, phase: "queued" },
      },
    });
    return { status: "CANCELLED" as const };
  });
}
