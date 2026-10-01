import { selectUsageRate } from "@aiwa/credits";
import { captureCreditsForJob, releaseOrRefundCredits } from "@aiwa/credits";
import {
  createCreditQuote,
  getImageProviderCostMicroUsd,
  videoInputProviderCost,
} from "@aiwa/credits";
import { finalizeAssetStorage, releaseAssetStorage } from "@aiwa/assets";
import { parseServerEnv } from "@aiwa/config";
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
import { issueProviderMediaGrant } from "./provider-media-grant";
import {
  downloadImage,
  downloadVideo,
  ImageStorageError,
  referenceImageDataUri,
  storeAudio,
  storeImage,
  storeVideo,
  storedAssetSize,
} from "./storage";

async function generationRecipient(
  tx: Prisma.TransactionClient,
  userId: string,
  category: "generationCompleted" | "generationFailed",
): Promise<string | null> {
  const runtimeTx = tx as Prisma.TransactionClient & {
    user?: Prisma.TransactionClient["user"];
    mailMessage?: Prisma.TransactionClient["mailMessage"];
    notificationPreference?: Prisma.TransactionClient["notificationPreference"];
  };
  if (!runtimeTx.user || !runtimeTx.mailMessage) return null;
  const user = await runtimeTx.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      disabledAt: true,
      notificationPreference: {
        select: {
          generationCompleted: true,
          generationFailed: true,
        },
      },
    },
  });
  if (!user || user.disabledAt) return null;
  const preferences = user.notificationPreference;
  if (preferences && preferences[category] === false) return null;
  return user.email;
}

async function enqueueGenerationFailure(
  tx: Prisma.TransactionClient,
  job: { id: string; organizationId: string; createdById: string },
  message: string,
): Promise<void> {
  const to = await generationRecipient(tx, job.createdById, "generationFailed");
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
  const to = await generationRecipient(
    tx,
    job.createdById,
    "generationCompleted",
  );
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

const SAFE_FAILURE_CODE = /^[A-Za-z0-9_.:-]{1,100}$/;

function normalizedFailureCode(code?: string): string {
  return code && SAFE_FAILURE_CODE.test(code) ? code : "GENERATION_FAILED";
}

function providerRequestFailureCode(error: ProviderRequestError): string {
  return error.code && SAFE_FAILURE_CODE.test(error.code)
    ? error.code
    : "PROVIDER_REJECTED";
}

export async function failJob(
  id: string,
  message: string,
  expectedStatus: "QUEUED" | "SUBMITTED" | "PROCESSING",
  errorCode?: string,
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
    const pendingAssets = await tx.asset.aggregate({
      where: { generationJobId: id, status: "PENDING" },
      _sum: { byteSize: true },
    });
    const reservedAssetBytes = pendingAssets._sum.byteSize ?? 0n;
    if (reservedAssetBytes > 0n) {
      await releaseAssetStorage(tx, {
        organizationId: job.organizationId,
        reservedBytes: reservedAssetBytes,
      });
    }
    await tx.asset.updateMany({
      where: { generationJobId: id, status: "PENDING" },
      data: {
        status: "DELETED",
        byteSize: 0n,
        deletedAt: new Date(),
        purgeAfter: new Date(),
      },
    });
    await tx.generationJob.update({
      where: { id },
      data: {
        status: "FAILED",
        errorCode: normalizedFailureCode(errorCode),
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
    const videoPayload = job.requestPayload as Record<string, unknown>;
    const frameIds = [
      videoPayload.firstFrameAssetId,
      videoPayload.lastFrameAssetId,
    ].filter((value): value is string => typeof value === "string");
    const referenceVideoId =
      typeof videoPayload.referenceVideoAssetId === "string"
        ? videoPayload.referenceVideoAssetId
        : null;
    const inputs =
      frameIds.length || referenceVideoId
        ? await db.generationInputAsset.findMany({
            where: { generationJobId: job.id },
            include: { asset: true },
            orderBy: { position: "asc" },
          })
        : [];
    if (
      inputs.length !==
        new Set([...frameIds, ...(referenceVideoId ? [referenceVideoId] : [])])
          .size ||
      inputs.some(
        ({ asset }) =>
          asset.organizationId !== job.organizationId ||
          asset.status !== "READY" ||
          (asset.purpose === "REFERENCE_INPUT" &&
            asset.storageOwnerUserId !== job.createdById) ||
          (asset.id === referenceVideoId
            ? asset.mediaKind !== "VIDEO" ||
              asset.mimeType !== "video/mp4" ||
              asset.storageProvider !== "LOCAL"
            : asset.mediaKind !== "IMAGE"),
      )
    )
      throw new ProviderRequestError("Source image is unavailable", false, {
        code: "REFERENCE_IMAGE_UNAVAILABLE",
      });
    const frameImages = await Promise.all(
      frameIds.map(async (assetId) => {
        const asset = inputs.find((item) => item.assetId === assetId)?.asset;
        if (!asset)
          throw new ProviderRequestError("Source image is unavailable", false, {
            code: "REFERENCE_IMAGE_UNAVAILABLE",
          });
        return referenceImageDataUri(asset);
      }),
    );
    let referenceVideoUrl: string | undefined;
    if (referenceVideoId) {
      const env = parseServerEnv();
      const base = new URL(env.APP_URL);
      if (base.protocol !== "https:")
        throw new ProviderRequestError(
          "Provider source requires a public HTTPS app URL",
          false,
          { code: "INVALID_PROVIDER_SOURCE" },
        );
      const url = new URL(
        `/api/provider-media/${encodeURIComponent(referenceVideoId)}`,
        base,
      );
      url.searchParams.set("jobId", job.id);
      url.searchParams.set(
        "grant",
        issueProviderMediaGrant({
          secret: env.AUTH_SECRET,
          jobId: job.id,
          assetId: referenceVideoId,
        }),
      );
      referenceVideoUrl = url.toString();
    }
    const result = await provider.submit({
      idempotencyKey: job.idempotencyKey,
      modelId: job.providerModel.providerModelId,
      mediaKind: "video",
      input: {
        ...videoPayload,
        ...(frameImages[0] ? { firstFrameImage: frameImages[0] } : {}),
        ...(frameImages[1] ? { lastFrameImage: frameImages[1] } : {}),
        ...(referenceVideoUrl ? { referenceVideoUrl } : {}),
      },
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
        error instanceof ProviderRequestError
          ? providerRequestFailureCode(error)
          : undefined,
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
    include: { providerModel: true, priceVersion: true },
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
      result.errorCode ??
        (result.status === "cancelled"
          ? "PROVIDER_CANCELLED"
          : "PROVIDER_FAILED"),
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

  // Preserve the provider's billable measurement without trusting arbitrary
  // response fields as persisted job data. A missing or malformed usage value
  // remains unknown; it must never be inferred from the requested duration.
  const rawCompletionTokens = result.rawUsage?.completion_tokens;
  const completionTokens =
    typeof rawCompletionTokens === "number" &&
    Number.isSafeInteger(rawCompletionTokens) &&
    rawCompletionTokens >= 0
      ? rawCompletionTokens
      : null;
  const requestPayload = job.requestPayload as Record<string, unknown>;
  const hasReferenceVideo =
    typeof requestPayload.referenceVideoAssetId === "string";
  const tokenPriced = job.priceVersion.pricingDimension === "TOKEN";
  if (
    (hasReferenceVideo || tokenPriced) &&
    (completionTokens === null || completionTokens === 0)
  ) {
    await db.generationJob.updateMany({
      where: { id, status: "PROCESSING" },
      data: {
        status: "MANUAL_REVIEW",
        errorCode: "MISSING_PROVIDER_USAGE",
        errorMessage:
          "Provider succeeded without billable token usage. Credits remain reserved for review.",
      },
    });
    return;
  }

  if (completionTokens !== null && completionTokens > 0) {
    await db.generationJob.updateMany({
      where: { id, status: "PROCESSING" },
      data: { outputPayload: { providerUsage: { completionTokens } } },
    });
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
    const current = await tx.generationJob.findUniqueOrThrow({
      where: { id },
      include: { priceVersion: true },
    });
    if (current.status !== "PROCESSING") return;
    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { organizationId: job.organizationId },
    });
    const resolution = requestPayload.resolution === "1080p" ? "1080p" : "720p";
    const rate = tokenPriced
      ? selectUsageRate(
          current.priceVersion.usageRates,
          resolution,
          hasReferenceVideo,
        )
      : resolution === "1080p"
        ? current.priceVersion.videoInputRate1080p
        : current.priceVersion.videoInputRate720p;
    if (hasReferenceVideo && !rate)
      throw new Error(
        "The reference-video price snapshot is missing its token rate.",
      );
    const actualCost =
      hasReferenceVideo || tokenPriced
        ? videoInputProviderCost(BigInt(completionTokens!), rate!)
        : null;
    const actualQuote =
      actualCost === null
        ? null
        : createCreditQuote({
            providerCostMicroUsd: actualCost,
            exchangeRate: {
              baisaNumerator: current.priceVersion.fxBaisaNumerator,
              baisaDenominator: current.priceVersion.fxBaisaDenominator,
            },
            targetGrossMarginBps: current.priceVersion.targetMarginBps,
            creditsPerBaisa: current.priceVersion.creditsPerBaisa,
          });
    const charge =
      actualQuote && actualQuote.customerCredits < current.reservedCredits
        ? actualQuote.customerCredits
        : current.reservedCredits;
    await captureCreditsForJob(tx, {
      walletId: wallet.id,
      jobId: id,
      amountCredits: charge,
      idempotencyKey: `generation-capture-${id}`,
      ...(hasReferenceVideo || tokenPriced
        ? {
            metadata: {
              completionTokens,
              cappedAtReservation: actualQuote!.customerCredits > charge,
            },
          }
        : {}),
    });
    const pendingAsset = await tx.asset.findUniqueOrThrow({
      where: { objectKey: `${id}.mp4` },
      select: { byteSize: true, status: true },
    });
    if (pendingAsset.status === "PENDING") {
      await finalizeAssetStorage(tx, {
        organizationId: job.organizationId,
        reservedBytes: pendingAsset.byteSize,
        actualBytes: stored.byteSize,
      });
    }
    const asset = await tx.asset.update({
      where: { objectKey: `${id}.mp4` },
      data: { ...stored, status: "READY" },
    });
    await tx.generationJob.update({
      where: { id },
      data: {
        status: "SUCCEEDED",
        actualProviderCostMicroUsd: actualCost,
        providerCostBasis: actualCost === null ? null : "PROVIDER_USAGE",
        actualUnits:
          tokenPriced || hasReferenceVideo
            ? completionTokens
            : current.quotedUnits,
        completedAt: new Date(),
        outputPayload: {
          stored: true,
          ...(completionTokens === null
            ? {}
            : { providerUsage: { completionTokens } }),
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
    if (asset?.id) {
      await enqueueGenerationSuccess(tx, { ...job, id }, asset.id);
    }
  });
}

function parseImageOutputUrls(payload: unknown): string[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.url === "string" && record.url) {
    return [record.url];
  }
  if (!Array.isArray(record.outputs)) return [];
  const urls: string[] = [];
  for (const item of record.outputs) {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      typeof (item as Record<string, unknown>).url !== "string"
    ) {
      return [];
    }
    urls.push((item as { url: string }).url);
  }
  return urls;
}

function expectedImageObjectKey(
  jobId: string,
  outputIndex: number,
  totalSlots: number,
  extension: "png" | "jpg",
): string {
  return totalSlots === 1
    ? `${jobId}.${extension}`
    : `${jobId}-${outputIndex + 1}.${extension}`;
}

export async function processImageJob(
  id: string,
  provider: MediaGenerationProvider,
) {
  let job = await db.generationJob.findUniqueOrThrow({
    where: { id },
    include: {
      providerModel: true,
      priceVersion: true,
      inputAssets: {
        orderBy: { position: "asc" },
        include: { asset: true },
      },
    },
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
      const referenceImages = await Promise.all(
        (job.inputAssets ?? []).map(async ({ asset }) => {
          if (
            asset.organizationId !== job.organizationId ||
            asset.storageOwnerUserId !== job.createdById ||
            asset.purpose !== "REFERENCE_INPUT" ||
            asset.mediaKind !== "IMAGE" ||
            asset.status !== "READY"
          ) {
            throw new ProviderRequestError(
              "Reference image is no longer available",
              false,
              { code: "REFERENCE_IMAGE_UNAVAILABLE" },
            );
          }
          try {
            return await referenceImageDataUri({
              objectKey: asset.objectKey,
              mimeType: asset.mimeType,
              storageProvider: asset.storageProvider,
            });
          } catch (error) {
            throw new ProviderRequestError(
              "Reference image is no longer available",
              false,
              {
                code: "REFERENCE_IMAGE_UNAVAILABLE",
                cause: error,
              },
            );
          }
        }),
      );
      const result = await provider.submit({
        idempotencyKey: job.idempotencyKey,
        modelId: job.providerModel.providerModelId,
        mediaKind: "image",
        input: {
          ...(job.requestPayload as Record<string, unknown>),
          referenceImages,
        },
      });
      const requestedCount = job.quotedUnits ?? 1;
      const outputUrls = result.outputUrls ?? [];
      if (result.status !== "succeeded" || outputUrls.length === 0) {
        throw new ProviderRequestError(
          "BytePlus returned no successful image outputs",
          false,
          { code: "INVALID_PROVIDER_RESPONSE" },
        );
      }
      if (outputUrls.length > requestedCount) {
        await db.generationJob.updateMany({
          where: { id, status: "SUBMITTED" },
          data: {
            status: "MANUAL_REVIEW",
            providerRequestId: result.providerRequestId,
            outputPayload: {
              requestedCount,
              outputs: outputUrls.map((url, index) => ({ index, url })),
            },
            errorCode: "PROVIDER_OUTPUT_OVERFLOW",
            errorMessage:
              "Provider returned more images than reserved. Credits remain held for review.",
          },
        });
        return;
      }
      const persistedProviderResult = await db.generationJob.updateMany({
        where: { id, status: "SUBMITTED" },
        data: {
          status: "PROCESSING",
          providerRequestId: result.providerRequestId,
          outputPayload: {
            requestedCount,
            outputs: outputUrls.map((url, index) => ({ index, url })),
          },
          errorCode: null,
          errorMessage: null,
        },
      });
      if (!persistedProviderResult.count) return;
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
          error instanceof ProviderRequestError
            ? providerRequestFailureCode(error)
            : undefined,
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

    job = await db.generationJob.findUniqueOrThrow({
      where: { id },
      include: {
        providerModel: true,
        priceVersion: true,
        inputAssets: {
          orderBy: { position: "asc" },
          include: { asset: true },
        },
      },
    });
  }
  if (job.status !== "PROCESSING") return;

  const outputUrls = parseImageOutputUrls(job.outputPayload);
  if (outputUrls.length === 0) {
    await recordStorageFailure(
      id,
      new ImageStorageError(
        "IMAGE_OUTPUT_URL_INVALID",
        "Provider image output metadata was unavailable.",
      ),
    );
    return;
  }

  const outputAssets = await db.asset.findMany({
    where: {
      generationJobId: id,
      sourceType: "GENERATED",
      mediaKind: "IMAGE",
      generationOutputIndex: { not: null },
    },
    orderBy: { generationOutputIndex: "asc" },
  });
  const requestedCount = job.quotedUnits ?? outputAssets.length;
  if (
    outputAssets.length !== requestedCount ||
    outputUrls.length > outputAssets.length
  ) {
    await db.generationJob.updateMany({
      where: { id, status: "PROCESSING" },
      data: {
        status: "MANUAL_REVIEW",
        errorCode: "OUTPUT_RESERVATION_MISMATCH",
        errorMessage:
          "Generated output reservations do not match the provider result. Credits remain held for review.",
      },
    });
    return;
  }

  for (let outputIndex = 0; outputIndex < outputUrls.length; outputIndex += 1) {
    const asset = outputAssets[outputIndex]!;
    if (asset.status === "READY") continue;
    if (asset.status !== "PENDING") {
      await db.generationJob.updateMany({
        where: { id, status: "PROCESSING" },
        data: {
          status: "MANUAL_REVIEW",
          errorCode: "OUTPUT_ASSET_STATE_INVALID",
          errorMessage:
            "A generated output slot is not recoverable. Credits remain held for review.",
        },
      });
      return;
    }

    const extension = asset.mimeType === "image/jpeg" ? "jpg" : "png";
    const expectedKey = expectedImageObjectKey(
      id,
      outputIndex,
      requestedCount,
      extension,
    );
    if (
      asset.objectKey !== expectedKey ||
      !["image/png", "image/jpeg"].includes(asset.mimeType)
    ) {
      await db.generationJob.updateMany({
        where: { id, status: "PROCESSING" },
        data: {
          status: "MANUAL_REVIEW",
          errorCode: "OUTPUT_ASSET_METADATA_INVALID",
          errorMessage:
            "A generated output slot has invalid storage metadata. Credits remain held for review.",
        },
      });
      return;
    }

    try {
      const bytes = await downloadImage(
        outputUrls[outputIndex]!,
        asset.mimeType === "image/jpeg" ? "jpeg" : "png",
      );
      const stored = await storeImage(asset.objectKey, bytes);
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM Asset WHERE id = ${asset.id} FOR UPDATE`;
        const currentAsset = await tx.asset.findUniqueOrThrow({
          where: { id: asset.id },
          select: { status: true, byteSize: true },
        });
        if (currentAsset.status === "READY") return;
        if (currentAsset.status !== "PENDING") {
          throw new Error("Output asset state changed during storage.");
        }
        await finalizeAssetStorage(tx, {
          organizationId: job.organizationId,
          reservedBytes: currentAsset.byteSize,
          actualBytes: stored.byteSize,
        });
        await tx.asset.update({
          where: { id: asset.id },
          data: { ...stored, status: "READY" },
        });
      });
    } catch (error) {
      await recordStorageFailure(id, error);
      throw error;
    }
  }

  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM GenerationJob WHERE id = ${id} FOR UPDATE`;
    const current = await tx.generationJob.findUniqueOrThrow({
      where: { id },
      include: { priceVersion: true, providerModel: true },
    });
    if (current.status !== "PROCESSING") return;

    const assets = await tx.asset.findMany({
      where: {
        generationJobId: id,
        sourceType: "GENERATED",
        mediaKind: "IMAGE",
        generationOutputIndex: { not: null },
      },
      orderBy: { generationOutputIndex: "asc" },
    });
    const successfulCount = outputUrls.length;
    const readySuccessful = assets
      .slice(0, successfulCount)
      .every((asset) => asset.status === "READY");
    if (!readySuccessful) {
      throw new Error("Not all successful outputs are durably stored.");
    }

    const unused = assets
      .slice(successfulCount)
      .filter((asset) => asset.status === "PENDING");
    const unusedReservedBytes = unused.reduce(
      (total, asset) => total + asset.byteSize,
      0n,
    );
    if (unusedReservedBytes > 0n) {
      await releaseAssetStorage(tx, {
        organizationId: job.organizationId,
        reservedBytes: unusedReservedBytes,
      });
      await tx.asset.updateMany({
        where: { id: { in: unused.map((asset) => asset.id) } },
        data: {
          status: "DELETED",
          byteSize: 0n,
          deletedAt: new Date(),
          purgeAfter: new Date(),
        },
      });
    }

    const quotedUnits = current.quotedUnits ?? 1;
    if (
      quotedUnits <= 0 ||
      current.reservedCredits % BigInt(quotedUnits) !== 0n
    ) {
      throw new Error(
        "Image credit reservation is not divisible by quoted units.",
      );
    }
    const creditsPerImage = current.reservedCredits / BigInt(quotedUnits);
    const chargedCredits = creditsPerImage * BigInt(successfulCount);
    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { organizationId: job.organizationId },
    });
    await captureCreditsForJob(tx, {
      walletId: wallet.id,
      jobId: id,
      amountCredits: chargedCredits,
      idempotencyKey: `generation-capture-${id}`,
      metadata: {
        quotedOutputs: quotedUnits,
        successfulOutputs: successfulCount,
        unusedOutputs: quotedUnits - successfulCount,
      },
    });

    const resolution =
      typeof current.requestPayload === "object" &&
      current.requestPayload !== null &&
      "resolution" in current.requestPayload &&
      typeof (current.requestPayload as { resolution?: unknown }).resolution ===
        "string"
        ? (current.requestPayload as { resolution: string }).resolution
        : undefined;
    const unitProviderCost = getImageProviderCostMicroUsd({
      providerModelId: current.providerModel.providerModelId,
      baseCostMicroUsd: current.priceVersion.providerCostMicroUsd,
      resolution,
    });
    const actualProviderCostMicroUsd =
      unitProviderCost * BigInt(successfulCount);
    const readyAssets = assets.slice(0, successfulCount);
    await tx.generationJob.update({
      where: { id },
      data: {
        status: "SUCCEEDED",
        actualUnits: successfulCount,
        billableQuantity: successfulCount,
        actualProviderCostMicroUsd,
        providerCostBasis: "CONFIGURED_RATE",
        completedAt: new Date(),
        outputPayload: {
          stored: true,
          requestedCount: quotedUnits,
          successfulCount,
          partialSuccess: successfulCount < quotedUnits,
          assetIds: readyAssets.map((asset) => asset.id),
        },
        errorCode: null,
        errorMessage: null,
      },
    });
    await tx.auditEvent.create({
      data: {
        organizationId: job.organizationId,
        actorUserId: job.createdById,
        action:
          successfulCount < quotedUnits
            ? "generation.partial_succeeded"
            : "generation.succeeded",
        targetType: "GenerationJob",
        targetId: id,
        metadata: {
          requestedOutputs: quotedUnits,
          successfulOutputs: successfulCount,
          chargedCredits: chargedCredits.toString(),
          releasedCredits: (
            current.reservedCredits - chargedCredits
          ).toString(),
        },
      },
    });
    const firstAsset = readyAssets[0];
    if (firstAsset) {
      await enqueueGenerationSuccess(tx, { ...job, id }, firstAsset.id);
    }
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
        error instanceof ProviderRequestError
          ? providerRequestFailureCode(error)
          : undefined,
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
    priceVersion: { providerCostMicroUsd: bigint; unitQuantity: number };
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
    const pendingAsset = await tx.asset.findUniqueOrThrow({
      where: { objectKey: `${id}.mp3` },
      select: { byteSize: true, status: true },
    });
    if (pendingAsset.status === "PENDING") {
      await finalizeAssetStorage(tx, {
        organizationId: job.organizationId,
        reservedBytes: pendingAsset.byteSize,
        actualBytes: stored.byteSize,
      });
    }
    const asset = await tx.asset.update({
      where: { objectKey: `${id}.mp3` },
      data: { ...stored, status: "READY" },
    });
    await tx.generationJob.update({
      where: { id },
      data: {
        status: "SUCCEEDED",
        actualUnits: current.quotedUnits,
        providerCostBasis: "CONFIGURED_CHARACTERS",
        actualProviderCostMicroUsd:
          current.billableQuantity == null
            ? null
            : (job.priceVersion.providerCostMicroUsd *
                BigInt(current.billableQuantity) +
                BigInt(job.priceVersion.unitQuantity) -
                1n) /
              BigInt(job.priceVersion.unitQuantity),
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
    if (asset?.id) {
      await enqueueGenerationSuccess(tx, { ...job, id }, asset.id);
    }
  });
}
