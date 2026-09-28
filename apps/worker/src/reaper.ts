import { db } from "@aiwa/db";
import { deleteStoredAsset } from "@aiwa/generation/storage";

export async function reapExpiredRecoveryJobs(now = new Date()) {
  const recoveryCutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const interruptedCutoff15m = new Date(now.getTime() - 15 * 60 * 1000);
  const videoCutoff2h = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  // Lost responses cannot safely be replayed for synchronous image or voice
  // generation because the provider may already have accepted and billed it.
  await db.generationJob.updateMany({
    where: {
      status: "SUBMITTED",
      submittedAt: { lt: interruptedCutoff15m },
    },
    data: {
      status: "MANUAL_REVIEW",
      errorCode: "WORKER_INTERRUPTED",
      errorMessage:
        "Submission was interrupted. Credits remain reserved for review.",
    },
  });

  await db.generationJob.updateMany({
    where: {
      status: "PROCESSING",
      providerModel: { mediaKind: "IMAGE" },
      OR: [
        {
          submittedAt: {
            lt: recoveryCutoff24h,
          },
        },
        {
          submittedAt: null,
          createdAt: { lt: recoveryCutoff24h },
        },
      ],
    },
    data: {
      status: "MANUAL_REVIEW",
      errorCode: "STORAGE_FAILED",
      errorMessage:
        "Image could not be stored. Credits remain reserved for review.",
    },
  });

  await db.generationJob.updateMany({
    where: {
      status: "PROCESSING",
      providerModel: { mediaKind: "VOICE" },
      OR: [
        {
          submittedAt: {
            lt: recoveryCutoff24h,
          },
        },
        {
          submittedAt: null,
          createdAt: { lt: recoveryCutoff24h },
        },
      ],
    },
    data: {
      status: "MANUAL_REVIEW",
      errorCode: "STORAGE_FAILED",
      errorMessage:
        "Audio finalization exceeded the recovery window. Credits remain reserved for review.",
    },
  });

  await db.generationJob.updateMany({
    where: {
      status: "PROCESSING",
      providerModel: { mediaKind: "VIDEO" },
      submittedAt: { lt: videoCutoff2h },
    },
    data: {
      status: "MANUAL_REVIEW",
      errorCode: "PROVIDER_TIMEOUT",
      errorMessage:
        "Video generation exceeded the recovery window. Credits remain reserved for review.",
    },
  });
}


export async function reapExpiredReferenceAssets(now = new Date()) {
  const candidates = await db.asset.findMany({
    where: {
      expiresAt: { lt: now },
      generationJobId: null,
      status: { in: ["PENDING", "READY"] },
      generationInputs: { none: {} },
    },
    select: {
      id: true,
      organizationId: true,
      objectKey: true,
      status: true,
      byteSize: true,
    },
    take: 100,
    orderBy: { expiresAt: "asc" },
  });

  for (const candidate of candidates) {
    const claimed = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Organization WHERE id = ${candidate.organizationId} FOR UPDATE`;
      const result = await tx.asset.updateMany({
        where: {
          id: candidate.id,
          expiresAt: { lt: now },
          generationJobId: null,
          status: { in: ["PENDING", "READY"] },
          generationInputs: { none: {} },
        },
        data: {
          status: "DELETED",
          byteSize: 0n,
        },
      });
      return result.count === 1;
    });

    if (claimed) {
      try {
        await deleteStoredAsset(candidate.objectKey);
      } catch {
        await db.asset
          .updateMany({
            where: { id: candidate.id, status: "DELETED" },
            data: {
              status: candidate.status,
              byteSize: candidate.byteSize,
            },
          })
          .catch(() => undefined);
      }
    }
  }
}
