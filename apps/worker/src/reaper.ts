import { db } from "@aiwa/db";

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
