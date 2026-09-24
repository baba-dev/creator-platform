import { captureCreditsForJob, releaseOrRefundCredits } from "@aiwa/credits";
import { db, type Prisma } from "@aiwa/db";
import {
  enqueueMail,
  generationCompletedEmail,
  generationFailedEmail,
} from "@aiwa/mail";
import {
  ProviderConfigurationError,
  ProviderRequestError,
  type MediaGenerationProvider,
} from "@aiwa/providers";
import { requireMembership } from "./index";
import {
  downloadImage,
  downloadVideo,
  ImageStorageError,
  storeAudio,
  storeImage,
  storeVideo,
  storedAssetSize,
} from "./storage";

async function generationRecipient(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<string | null> {
  const runtimeTx = tx as Prisma.TransactionClient & {
    user?: Prisma.TransactionClient["user"];
    mailMessage?: Prisma.TransactionClient["mailMessage"];
  };
  if (!runtimeTx.user || !runtimeTx.mailMessage) return null;
  const user = await runtimeTx.user.findUnique({
    where: { id: userId },
    select: { email: true, disabledAt: true },
  });
  return user && !user.disabledAt ? user.email : null;
}

async function enqueueGenerationFailure(
  tx: Prisma.TransactionClient,
  job: { id: string; organizationId: string; createdById: string },
  message: string,
): Promise<void> {
  const to = await generationRecipient(tx, job.createdById);
  if (!to) return;
  await enqueueMail(
    generationFailedEmail({
      to,
      userId: job.createdById,
      organizationId: job.organizationId,
      generationJobId: job.id,
      message,
    }),
    tx,
  );
}

async function enqueueGenerationSuccess(
  tx: Prisma.TransactionClient,
  job: { id: string; organizationId: string; createdById: string },
  assetId: string,
): Promise<void> {
  const to = await generationRecipient(tx, job.createdById);
  if (!to) return;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  await enqueueMail(
    generationCompletedEmail({
      to,
      userId: job.createdById,
      organizationId: job.organizationId,
      generationJobId: job.id,
      assetUrl: new URL(
        `/api/assets/${encodeURIComponent(assetId)}`,
        appUrl,
      ).toString(),
    }),
    tx,
  );
}

export async function failJob(
  id: string,
  message: string,
  expectedStatus: "QUEUED" | "SUBMITTED" | "PROCESSING",
) {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM GenerationJob WHERE id = ${id} FOR UPDATE`;
    const job = await tx.generationJob.findUniqueOrThrow({ where: { id } });
    // The worker may have read an earlier state before an operator reconciled
    // this job. A stale provider result must never override manual review or
    // release a reservation after evidence of a charge has been recorded.
    if (job.status !== expectedStatus) return;
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
    await enqueueGenerationFailure(tx, job, message);
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

  if (job.providerModel.enabled === false) return;

  try {
    await requireMembership(db, job.organizationId, job.createdById, true);
  } catch {
    await failJob(id, "Workspace access changed before generation.", "QUEUED");
    return;
  }

  const claimed = await db.generationJob.updateMany({
    where: { id, status: "QUEUED" },
    data: { status: "SUBMITTED", submittedAt: new Date() },
  });
  if (!claimed.count) return;

  const modelId = job.providerModel.id ?? job.providerModelId;
  const currentModel = await db.providerModel.findUnique({
    where: { id: modelId },
    select: { enabled: true },
  });
  if (!currentModel || currentModel.enabled === false) {
    await db.generationJob.updateMany({
      where: { id, status: "SUBMITTED" },
      data: { status: "QUEUED", submittedAt: null },
    });
    return;
  }

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
    if (
      error instanceof ProviderConfigurationError ||
      (error instanceof ProviderRequestError && !error.retryable)
    ) {
      await failJob(
        id,
        error instanceof ProviderConfigurationError
          ? "Generation provider is unavailable. Credits released."
          : "Provider rejected the video request. Credits released.",
        "SUBMITTED",
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
    await failJob(
      id,
      "Provider did not complete the video. Credits released.",
      "PROCESSING",
    );
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
    const asset = await tx.asset.update({
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
    if (asset?.id) {
      await enqueueGenerationSuccess(tx, { ...job, id }, asset.id);
    }
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
    if (job.providerModel.enabled === false) return;

    try {
      await requireMembership(db, job.organizationId, job.createdById, true);
    } catch {
      await failJob(
        id,
        "Workspace access changed before generation.",
        "QUEUED",
      );
      return;
    }
    const claimed = await db.generationJob.updateMany({
      where: { id, status: "QUEUED" },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
    if (!claimed.count) return;

    const modelId = job.providerModel.id ?? job.providerModelId;
    const currentModel = await db.providerModel.findUnique({
      where: { id: modelId },
      select: { enabled: true },
    });
    if (!currentModel || currentModel.enabled === false) {
      await db.generationJob.updateMany({
        where: { id, status: "SUBMITTED" },
        data: { status: "QUEUED", submittedAt: null },
      });
      return;
    }
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
      if (
        error instanceof ProviderConfigurationError ||
        (error instanceof ProviderRequestError && !error.retryable)
      ) {
        await failJob(
          id,
          error instanceof ProviderConfigurationError
            ? "Generation provider is unavailable. Credits released."
            : "Provider rejected the image request. Credits released.",
          "SUBMITTED",
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
    const asset = await tx.asset.update({
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
    await enqueueGenerationSuccess(tx, { ...job, id }, asset.id);
  });
}

export async function processVoiceJob(
  id: string,
  provider: MediaGenerationProvider,
) {
  const job = await db.generationJob.findUniqueOrThrow({
    where: { id },
    include: { providerModel: true, priceVersion: true },
  });
  if (job.status === "PROCESSING") {
    const output = job.outputPayload as {
      stored?: unknown;
      byteSize?: unknown;
      sha256?: unknown;
    } | null;
    if (
      output?.stored !== true ||
      typeof output.byteSize !== "number" ||
      !Number.isSafeInteger(output.byteSize) ||
      output.byteSize <= 0 ||
      typeof output.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(output.sha256)
    ) {
      await db.generationJob.updateMany({
        where: { id, status: "PROCESSING" },
        data: {
          status: "MANUAL_REVIEW",
          errorCode: "AUDIO_STORAGE_METADATA_INVALID",
          errorMessage:
            "Stored audio metadata is unavailable. Credits remain reserved for manual review.",
        },
      });
      return;
    }
    try {
      const byteSize = await storedAssetSize(`${id}.mp3`);
      if (byteSize !== output.byteSize) {
        throw new Error("Stored audio size does not match its metadata");
      }
    } catch (error) {
      await recordStorageFailure(id, error, "audio");
      throw error;
    }
    await finalizeVoiceJob(id, job, {
      byteSize: BigInt(output.byteSize),
      sha256: output.sha256,
    });
    return;
  }
  if (job.status !== "QUEUED") return;

  if (job.providerModel.enabled === false) return;

  try {
    await requireMembership(db, job.organizationId, job.createdById, true);
  } catch {
    await failJob(id, "Workspace access changed before generation.", "QUEUED");
    return;
  }

  const claimed = await db.generationJob.updateMany({
    where: { id, status: "QUEUED" },
    data: { status: "SUBMITTED", submittedAt: new Date() },
  });
  if (!claimed.count) return;

  const modelId = job.providerModel.id ?? job.providerModelId;
  const currentModel = await db.providerModel.findUnique({
    where: { id: modelId },
    select: { enabled: true },
  });
  if (!currentModel || currentModel.enabled === false) {
    await db.generationJob.updateMany({
      where: { id, status: "SUBMITTED" },
      data: { status: "QUEUED", submittedAt: null },
    });
    return;
  }

  let result;
  try {
    result = await provider.submit({
      idempotencyKey: job.idempotencyKey,
      modelId: job.providerModel.providerModelId,
      mediaKind: "voice",
      input: job.requestPayload as Record<string, unknown>,
    });
    if (
      result.status !== "succeeded" ||
      result.inlineOutputs?.length !== 1 ||
      result.inlineOutputs[0]?.mediaType !== "audio/mpeg"
    ) {
      throw new ProviderRequestError(
        "BytePlus returned an unexpected voice result",
        true,
        { code: "INVALID_PROVIDER_RESPONSE" },
      );
    }
  } catch (error) {
    if (
      error instanceof ProviderConfigurationError ||
      (error instanceof ProviderRequestError && !error.retryable)
    ) {
      await failJob(
        id,
        error instanceof ProviderConfigurationError
          ? "Generation provider is unavailable. Credits released."
          : "Provider rejected the voice request. Credits released.",
        "SUBMITTED",
      );
      return;
    }
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

  const base64 = result.inlineOutputs[0]?.dataBase64;
  if (!base64) {
    await db.generationJob.updateMany({
      where: { id, status: "SUBMITTED" },
      data: {
        status: "MANUAL_REVIEW",
        providerRequestId: result.providerRequestId,
        errorCode: "INVALID_PROVIDER_RESPONSE",
        errorMessage:
          "Provider returned empty voice audio. Credits remain reserved for manual review.",
      },
    });
    return;
  }

  const audioBytes = Buffer.from(base64, "base64");
  const canonicalBase64 = audioBytes.toString("base64").replace(/=+$/u, "");
  if (canonicalBase64 !== base64.replace(/=+$/u, "")) {
    await db.generationJob.updateMany({
      where: { id, status: "SUBMITTED" },
      data: {
        status: "MANUAL_REVIEW",
        providerRequestId: result.providerRequestId,
        errorCode: "INVALID_PROVIDER_RESPONSE",
        errorMessage:
          "Provider returned malformed voice audio. Credits remain reserved for manual review.",
      },
    });
    return;
  }
  let stored: Awaited<ReturnType<typeof storeAudio>> | null = null;
  let lastStorageError: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      stored = await storeAudio(`${id}.mp3`, audioBytes);
      break;
    } catch (error) {
      lastStorageError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
      }
    }
  }

  if (!stored) {
    const code =
      lastStorageError instanceof ImageStorageError
        ? lastStorageError.code
        : "STORAGE_WRITE_FAILED";
    await db.generationJob.updateMany({
      where: { id, status: "SUBMITTED" },
      data: {
        status: "MANUAL_REVIEW",
        providerRequestId: result.providerRequestId,
        errorCode: code,
        errorMessage:
          "Generated audio could not be written to persistent storage. Credits remain reserved for manual review.",
      },
    });
    throw lastStorageError;
  }

  const persisted = await db.generationJob.updateMany({
    where: { id, status: "SUBMITTED" },
    data: {
      status: "PROCESSING",
      providerRequestId: result.providerRequestId,
      outputPayload: {
        stored: true,
        byteSize: Number(stored.byteSize),
        sha256: stored.sha256,
      },
      errorCode: null,
      errorMessage: null,
    },
  });
  if (!persisted.count) return;

  await finalizeVoiceJob(id, job, stored);
}

async function finalizeVoiceJob(
  id: string,
  job: {
    organizationId: string;
    createdById: string;
    priceVersion: { providerCostMicroUsd: bigint };
  },
  stored: { byteSize: bigint; sha256: string },
) {
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
    const asset = await tx.asset.update({
      where: { objectKey: `${id}.mp3` },
      data: { ...stored, status: "READY" },
    });
    await tx.generationJob.update({
      where: { id },
      data: {
        status: "SUCCEEDED",
        actualUnits: current.quotedUnits,
        actualProviderCostMicroUsd:
          current.quotedUnits === null
            ? null
            : job.priceVersion.providerCostMicroUsd *
              BigInt(current.quotedUnits),
        completedAt: new Date(),
        outputPayload: {
          stored: true,
          byteSize: Number(stored.byteSize),
          sha256: stored.sha256,
        },
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
    await enqueueGenerationSuccess(tx, { ...job, id }, asset.id);
  });
}
