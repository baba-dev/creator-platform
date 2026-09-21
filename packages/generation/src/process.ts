import { captureCreditsForJob, releaseOrRefundCredits } from "@aiwa/credits";
import { db } from "@aiwa/db";
import {
  ProviderRequestError,
  type MediaGenerationProvider,
} from "@aiwa/providers";
import { requireMembership } from "./index";
import {
  downloadImage,
  downloadVideo,
  ImageStorageError,
  storeImage,
  storeVideo,
} from "./storage";

export async function failJob(id: string, message: string) {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM GenerationJob WHERE id = ${id} FOR UPDATE`;
    const job = await tx.generationJob.findUniqueOrThrow({ where: { id } });
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job.status)) return;
    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { organizationId: job.organizationId },
    });
    await releaseOrRefundCredits(tx, {
      walletId: wallet.id,
      jobId: id,
      reason: message,
      idempotencyKey: `generation-release-${id}`,
    });
    await tx.asset.updateMany({
      where: { generationJobId: id, status: "PENDING" },
      data: { status: "DELETED", byteSize: 0n },
    });
    await tx.generationJob.update({
      where: { id },
      data: {
        status: "FAILED",
        errorCode: "GENERATION_FAILED",
        errorMessage: message,
        completedAt: new Date(),
      },
    });
  });
}

async function recordStorageFailure(
  id: string,
  error: unknown,
  mediaLabel = "image",
) {
  const code =
    error instanceof ImageStorageError ? error.code : "STORAGE_RECOVERY_FAILED";
  const message =
    error instanceof ImageStorageError
      ? `${error.message} Credits remain reserved while storage recovery retries.`
      : `Generated ${mediaLabel} could not be saved. Credits remain reserved while storage recovery retries.`;

  await db.generationJob.updateMany({
    where: { id, status: "PROCESSING" },
    data: {
      errorCode: code,
      errorMessage: message,
    },
  });
}

export async function processVideoSubmitJob(
  id: string,
  provider: MediaGenerationProvider,
) {
  const job = await db.generationJob.findUniqueOrThrow({
    where: { id },
    include: { providerModel: true },
  });
  if (job.status !== "QUEUED") return;

  try {
    await requireMembership(db, job.organizationId, job.createdById, true);
  } catch {
    await failJob(id, "Workspace access changed before generation.");
    return;
  }

  const claimed = await db.generationJob.updateMany({
    where: { id, status: "QUEUED" },
    data: { status: "SUBMITTED", submittedAt: new Date() },
  });
  if (!claimed.count) return;

  try {
    const result = await provider.submit({
      idempotencyKey: job.idempotencyKey,
      modelId: job.providerModel.providerModelId,
      mediaKind: "video",
      input: job.requestPayload as Record<string, unknown>,
    });
    if (result.status !== "submitted" || !result.providerRequestId)
      throw new ProviderRequestError(
        "BytePlus returned an unexpected video submission result",
        true,
        { code: "INVALID_PROVIDER_RESPONSE" },
      );

    await db.generationJob.updateMany({
      where: { id, status: "SUBMITTED" },
      data: {
        status: "PROCESSING",
        providerRequestId: result.providerRequestId,
        errorCode: null,
        errorMessage: null,
      },
    });
  } catch (error) {
    if (error instanceof ProviderRequestError && !error.retryable) {
      await failJob(
        id,
        "Provider rejected the video request. Credits released.",
      );
      return;
    }
    // A timeout can occur after BytePlus accepted and billed the task. Do not
    // submit again without a provider request ID to reconcile.
    await db.generationJob.updateMany({
      where: { id, status: "SUBMITTED" },
      data: {
        status: "MANUAL_REVIEW",
        errorCode: "PROVIDER_OUTCOME_UNKNOWN",
        errorMessage:
          "Provider outcome needs review. Credits remain reserved; no automatic resubmission.",
      },
    });
  }
}

export async function processVideoPollJob(
  id: string,
  provider: MediaGenerationProvider,
) {
  const job = await db.generationJob.findUniqueOrThrow({
    where: { id },
    include: { providerModel: true },
  });
  if (job.status !== "PROCESSING" || !job.providerRequestId) return;

  let result;
  try {
    result = await provider.getJob(job.providerRequestId);
  } catch {
    await db.generationJob.updateMany({
      where: { id, status: "PROCESSING" },
      data: {
        errorCode: "PROVIDER_POLL_FAILED",
        errorMessage:
          "Video status is temporarily unavailable. Credits remain reserved while recovery retries.",
      },
    });
    return;
  }

  if (["submitted", "processing"].includes(result.status)) {
    if (job.errorCode)
      await db.generationJob.updateMany({
        where: { id, status: "PROCESSING" },
        data: { errorCode: null, errorMessage: null },
      });
    return;
  }

  if (["failed", "cancelled"].includes(result.status)) {
    await failJob(id, "Provider did not complete the video. Credits released.");
    return;
  }

  if (result.status !== "succeeded" || result.outputUrls?.length !== 1) {
    await db.generationJob.updateMany({
      where: { id, status: "PROCESSING" },
      data: {
        errorCode: "INVALID_PROVIDER_RESPONSE",
        errorMessage:
          "Provider returned invalid video output. Credits remain reserved while recovery retries.",
      },
    });
    return;
  }

  let stored: Awaited<ReturnType<typeof storeVideo>>;
  try {
    const bytes = await downloadVideo(result.outputUrls[0]!);
    stored = await storeVideo(`${id}.mp4`, bytes);
  } catch (error) {
    await recordStorageFailure(id, error, "video");
    throw error;
  }

  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM GenerationJob WHERE id = ${id} FOR UPDATE`;
    const current = await tx.generationJob.findUniqueOrThrow({ where: { id } });
    if (current.status !== "PROCESSING") return;
    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { organizationId: job.organizationId },
    });
    await captureCreditsForJob(tx, {
      walletId: wallet.id,
      jobId: id,
      amountCredits: current.reservedCredits,
      idempotencyKey: `generation-capture-${id}`,
    });
    await tx.asset.update({
      where: { objectKey: `${id}.mp4` },
      data: { ...stored, status: "READY" },
    });
    await tx.generationJob.update({
      where: { id },
      data: {
        status: "SUCCEEDED",
        completedAt: new Date(),
        outputPayload: { stored: true },
        errorCode: null,
        errorMessage: null,
      },
    });
    await tx.auditEvent.create({
      data: {
        organizationId: job.organizationId,
        actorUserId: job.createdById,
        action: "generation.succeeded",
        targetType: "GenerationJob",
        targetId: id,
      },
    });
  });
}

export async function processImageJob(
  id: string,
  provider: MediaGenerationProvider,
) {
  let job = await db.generationJob.findUniqueOrThrow({
    where: { id },
    include: { providerModel: true },
  });
  if (job.status === "QUEUED") {
    try {
      await requireMembership(db, job.organizationId, job.createdById, true);
    } catch {
      await failJob(id, "Workspace access changed before generation.");
      return;
    }
    const claimed = await db.generationJob.updateMany({
      where: { id, status: "QUEUED" },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
    if (!claimed.count) return;
    try {
      const result = await provider.submit({
        idempotencyKey: job.idempotencyKey,
        modelId: job.providerModel.providerModelId,
        mediaKind: "image",
        input: job.requestPayload as Record<string, unknown>,
      });
      if (result.status !== "succeeded" || result.outputUrls?.length !== 1)
        throw new Error("Unexpected provider result");
      await db.generationJob.update({
        where: { id },
        data: {
          status: "PROCESSING",
          providerRequestId: result.providerRequestId,
          outputPayload: { url: result.outputUrls[0]! },
          errorCode: null,
          errorMessage: null,
        },
      });
    } catch (error) {
      if (error instanceof ProviderRequestError && !error.retryable) {
        await failJob(
          id,
          "Provider rejected the image request. Credits released.",
        );
        return;
      }
      // The provider may have billed the request. Never blindly submit it again.
      await db.generationJob.updateMany({
        where: { id, status: "SUBMITTED" },
        data: {
          status: "MANUAL_REVIEW",
          errorCode: "PROVIDER_OUTCOME_UNKNOWN",
          errorMessage:
            "Provider outcome needs review. Credits remain reserved; no automatic resubmission.",
        },
      });
      return;
    }
    job = await db.generationJob.findUniqueOrThrow({
      where: { id },
      include: { providerModel: true },
    });
  }
  if (job.status !== "PROCESSING") return;

  let stored: Awaited<ReturnType<typeof storeImage>>;
  try {
    const output = job.outputPayload as { url?: unknown } | null;
    if (!output || typeof output.url !== "string" || !output.url) {
      throw new ImageStorageError(
        "IMAGE_OUTPUT_URL_INVALID",
        "Provider image output metadata was unavailable.",
      );
    }
    const bytes = await downloadImage(output.url);
    stored = await storeImage(`${id}.png`, bytes);
  } catch (error) {
    await recordStorageFailure(id, error);
    throw error;
  }

  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM GenerationJob WHERE id = ${id} FOR UPDATE`;
    const current = await tx.generationJob.findUniqueOrThrow({ where: { id } });
    if (current.status !== "PROCESSING") return;
    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { organizationId: job.organizationId },
    });
    await captureCreditsForJob(tx, {
      walletId: wallet.id,
      jobId: id,
      amountCredits: current.reservedCredits,
      idempotencyKey: `generation-capture-${id}`,
    });
    await tx.asset.update({
      where: { objectKey: `${id}.png` },
      data: { ...stored, status: "READY" },
    });
    await tx.generationJob.update({
      where: { id },
      data: {
        status: "SUCCEEDED",
        completedAt: new Date(),
        outputPayload: { stored: true },
        errorCode: null,
        errorMessage: null,
      },
    });
    await tx.auditEvent.create({
      data: {
        organizationId: job.organizationId,
        actorUserId: job.createdById,
        action: "generation.succeeded",
        targetType: "GenerationJob",
        targetId: id,
      },
    });
  });
}
