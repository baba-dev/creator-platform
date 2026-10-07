import { selectUsageRate } from "@aiwa/credits";
import { captureCreditsForJob, releaseOrRefundCredits } from "@aiwa/credits";
import {
  createCreditQuote,
  getImageGenerationProviderCostMicroUsd,
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
import { resolvePresetVoice } from "./voices";
import { issueProviderMediaGrant } from "./provider-media-grant";
import {
  produceSeedAudioLongForm,
  SeedAudioPartialGenerationError,
  SEED_AUDIO_LONG_FORM_MAX_OUTPUT_BYTES,
  SEED_AUDIO_LONG_FORM_MAX_SEGMENTS,
  SEED_AUDIO_NATIVE_MAX_SECONDS,
  type SeedAudioFormat,
} from "./seed-audio-long-form";
import {
  calculateSpeechTrialUsage,
  logSpeechTrialTelemetry,
} from "./speech-trial";
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
    include: {
      providerModel: true,
      inputAssets: {
        orderBy: { position: "asc" },
        include: { asset: true },
      },
    },
  });
  if (job.status !== "QUEUED") return;
  if (job.providerModel.enabled === false) {
    await failJob(
      id,
      "Selected video model was disabled before provider submission.",
      "QUEUED",
      "MODEL_DISABLED",
    );
    return;
  }

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
    await failJob(
      id,
      "Selected video model was disabled before provider submission.",
      "SUBMITTED",
      "MODEL_DISABLED",
    );
    return;
  }

  try {
    const videoPayload = job.requestPayload as Record<string, unknown>;
    const isV2 = videoPayload.schemaVersion === 2;

    let providerInput: Record<string, unknown>;
    if (isV2) {
      const sourcePayload = Array.isArray(videoPayload.sources)
        ? videoPayload.sources
        : [];
      if (sourcePayload.length !== job.inputAssets.length) {
        throw new ProviderRequestError(
          "Generation source snapshot is inconsistent",
          false,
          { code: "REFERENCE_MEDIA_UNAVAILABLE" },
        );
      }

      const expectedByPosition = new Map<
        number,
        { assetId: string; role: string }
      >();
      for (const value of sourcePayload) {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw new ProviderRequestError(
            "Generation source snapshot is invalid",
            false,
            { code: "REFERENCE_MEDIA_UNAVAILABLE" },
          );
        }
        const source = value as Record<string, unknown>;
        if (
          typeof source.assetId !== "string" ||
          typeof source.role !== "string" ||
          typeof source.position !== "number" ||
          !Number.isSafeInteger(source.position)
        ) {
          throw new ProviderRequestError(
            "Generation source snapshot is invalid",
            false,
            { code: "REFERENCE_MEDIA_UNAVAILABLE" },
          );
        }
        expectedByPosition.set(source.position, {
          assetId: source.assetId,
          role: source.role,
        });
      }

      const env = parseServerEnv();
      const base = new URL(env.APP_URL);
      if (job.inputAssets.length > 0 && base.protocol !== "https:") {
        throw new ProviderRequestError(
          "Provider sources require a public HTTPS app URL",
          false,
          { code: "INVALID_PROVIDER_SOURCE" },
        );
      }

      const providerSources = job.inputAssets.map((input) => {
        const expected = expectedByPosition.get(input.position);
        const asset = input.asset;
        if (
          !expected ||
          expected.assetId !== input.assetId ||
          expected.role !== input.role ||
          input.role === "LEGACY" ||
          asset.organizationId !== job.organizationId ||
          asset.status !== "READY" ||
          (asset.purpose === "REFERENCE_INPUT" &&
            asset.storageOwnerUserId !== job.createdById)
        ) {
          throw new ProviderRequestError(
            "Generation source media is no longer available",
            false,
            { code: "REFERENCE_MEDIA_UNAVAILABLE" },
          );
        }

        const url = new URL(
          `/api/provider-media/${encodeURIComponent(asset.id)}`,
          base,
        );
        url.searchParams.set("jobId", job.id);
        url.searchParams.set(
          "grant",
          issueProviderMediaGrant({
            secret: env.AUTH_SECRET,
            jobId: job.id,
            assetId: asset.id,
          }),
        );
        return { role: input.role, url: url.toString() };
      });

      providerInput = {
        ...videoPayload,
        sources: providerSources,
      };
    } else {
      // Historical V1 jobs keep their previous dispatch semantics. In
      // particular, frame images remain inline data URIs, so an upgrade cannot
      // strand an already-queued job merely because it predates V2 grants.
      const frameIds = [
        videoPayload.firstFrameAssetId,
        videoPayload.lastFrameAssetId,
      ].filter((value): value is string => typeof value === "string");
      const referenceVideoId =
        typeof videoPayload.referenceVideoAssetId === "string"
          ? videoPayload.referenceVideoAssetId
          : null;
      const inputs = job.inputAssets;
      if (
        inputs.length !==
          new Set([
            ...frameIds,
            ...(referenceVideoId ? [referenceVideoId] : []),
          ]).size ||
        inputs.some(
          ({ asset }) =>
            asset.organizationId !== job.organizationId ||
            asset.status !== "READY" ||
            (asset.purpose === "REFERENCE_INPUT" &&
              asset.storageOwnerUserId !== job.createdById) ||
            (asset.id === referenceVideoId
              ? asset.mediaKind !== "VIDEO" || asset.mimeType !== "video/mp4"
              : asset.mediaKind !== "IMAGE"),
        )
      ) {
        throw new ProviderRequestError("Source media is unavailable", false, {
          code: "REFERENCE_MEDIA_UNAVAILABLE",
        });
      }

      const frameImages = await Promise.all(
        frameIds.map(async (assetId) => {
          const asset = inputs.find((item) => item.assetId === assetId)?.asset;
          if (!asset)
            throw new ProviderRequestError(
              "Source image is unavailable",
              false,
              { code: "REFERENCE_IMAGE_UNAVAILABLE" },
            );
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

      providerInput = {
        ...videoPayload,
        ...(frameImages[0] ? { firstFrameImage: frameImages[0] } : {}),
        ...(frameImages[1] ? { lastFrameImage: frameImages[1] } : {}),
        ...(referenceVideoUrl ? { referenceVideoUrl } : {}),
      };
    }

    const result = await provider.submit({
      idempotencyKey: job.idempotencyKey,
      modelId: job.providerModel.providerModelId,
      mediaKind: "video",
      input: providerInput,
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
    if (error instanceof SeedAudioPartialGenerationError) {
      await db.generationJob.updateMany({
        where: { id, status: "SUBMITTED" },
        data: {
          status: "MANUAL_REVIEW",
          providerRequestId: error.providerRequestIds[0] ?? null,
          outputPayload: {
            longForm: {
              completedSegments: error.completedSegments,
              providerRequestIds: error.providerRequestIds,
            },
          },
          errorCode: error.code,
          errorMessage: error.message,
        },
      });
      return;
    }
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

function v2VideoInputContext(payload: Record<string, unknown>): {
  hasVideoInput: boolean;
  resolution: string;
  outputFormat: "mp4" | "mov";
  returnLastFrame: boolean;
} {
  const sources = Array.isArray(payload.sources) ? payload.sources : [];
  const hasVideoSource = sources.some((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return false;
    const role = (value as Record<string, unknown>).role;
    return role === "REFERENCE_VIDEO" || role === "SOURCE_VIDEO";
  });
  const billing =
    payload.draftBillingContext &&
    typeof payload.draftBillingContext === "object" &&
    !Array.isArray(payload.draftBillingContext)
      ? (payload.draftBillingContext as Record<string, unknown>)
      : null;
  const draftHadVideo =
    typeof billing?.totalInputVideoDurationMs === "number" &&
    billing.totalInputVideoDurationMs > 0;
  return {
    hasVideoInput: hasVideoSource || draftHadVideo,
    resolution:
      typeof payload.resolution === "string" ? payload.resolution : "720p",
    outputFormat: payload.outputFormat === "mov" ? "mov" : "mp4",
    returnLastFrame: payload.returnLastFrame !== false,
  };
}

export async function processVideoPollJob(
  id: string,
  provider: MediaGenerationProvider,
) {
  const job = await db.generationJob.findUniqueOrThrow({
    where: { id },
    include: {
      providerModel: true,
      priceVersion: true,
      inputAssets: { include: { asset: true }, orderBy: { position: "asc" } },
    },
  });
  if (job.status !== "PROCESSING" || !job.providerRequestId) return;

  let result;
  try {
    result = await provider.getJob(job.providerRequestId);
  } catch (error) {
    const outcomeUnknown =
      error instanceof ProviderRequestError &&
      error.code === "PROVIDER_OUTCOME_UNKNOWN";
    await db.generationJob.updateMany({
      where: { id, status: "PROCESSING" },
      data: {
        ...(outcomeUnknown ? { status: "MANUAL_REVIEW" as const } : {}),
        errorCode: outcomeUnknown
          ? "PROVIDER_OUTCOME_UNKNOWN"
          : "PROVIDER_POLL_FAILED",
        errorMessage: outcomeUnknown
          ? "Provider result is no longer available. Credits remain reserved for review; no automatic resubmission."
          : "Video status is temporarily unavailable. Credits remain reserved while recovery retries.",
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

  const rawCompletionTokens = result.rawUsage?.completion_tokens;
  const completionTokens =
    typeof rawCompletionTokens === "number" &&
    Number.isSafeInteger(rawCompletionTokens) &&
    rawCompletionTokens >= 0
      ? rawCompletionTokens
      : null;
  const requestPayload = job.requestPayload as Record<string, unknown>;
  const trustedTalkingAvatarDurationMs =
    job.providerModel.providerModelId === "omnihuman-1.5" &&
    typeof requestPayload.trustedDrivingAudioDurationMs === "number" &&
    Number.isSafeInteger(requestPayload.trustedDrivingAudioDurationMs) &&
    requestPayload.trustedDrivingAudioDurationMs > 0
      ? requestPayload.trustedDrivingAudioDurationMs
      : null;
  const isV2 = requestPayload.schemaVersion === 2;
  const v2Context = v2VideoInputContext(requestPayload);
  const hasVideoInput = isV2
    ? v2Context.hasVideoInput
    : typeof requestPayload.referenceVideoAssetId === "string";
  const tokenPriced = job.priceVersion.pricingDimension === "TOKEN";

  if (
    (hasVideoInput || tokenPriced) &&
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
      data: {
        outputPayload: {
          providerUsage: { completionTokens },
          providerReturnedLastFrame: Boolean(result.lastFrameUrl),
        },
      },
    });
  }

  const outputFormat = isV2 ? v2Context.outputFormat : "mp4";
  const videoObjectKey = `${id}.${outputFormat}`;
  let storedVideo: Awaited<ReturnType<typeof storeVideo>>;
  try {
    const bytes = await downloadVideo(result.outputUrls[0]!);
    const videoAssetForStorage = await db.asset.findFirstOrThrow({
      where: {
        generationJobId: id,
        objectKey: videoObjectKey,
        mediaKind: "VIDEO",
      },
      select: { id: true },
    });
    storedVideo = await storeVideo(
      videoObjectKey,
      bytes,
      job.organizationId,
      videoAssetForStorage.id,
    );
  } catch (error) {
    await recordStorageFailure(id, error, "video");
    throw error;
  }

  let storedLastFrame: Awaited<ReturnType<typeof storeImage>> | null = null;
  const wantsLastFrame = isV2 && v2Context.returnLastFrame;
  if (wantsLastFrame && result.lastFrameUrl) {
    try {
      const bytes = await downloadImage(result.lastFrameUrl, "jpeg");
      const lastFrameAssetForStorage = await db.asset.findFirst({
        where: {
          generationJobId: id,
          generationOutputIndex: 1,
          mediaKind: "IMAGE",
        },
        select: { id: true },
      });
      if (!lastFrameAssetForStorage) {
        throw new Error("Last-frame asset reservation is missing.");
      }
      storedLastFrame = await storeImage(
        `${id}-last-frame.jpg`,
        bytes,
        job.organizationId,
        lastFrameAssetForStorage.id,
      );
    } catch {
      // The video itself is the paid primary output. A provider-side last-frame
      // failure degrades the continuity feature but must not convert a valid
      // video into a failed, double-billed retry.
      storedLastFrame = null;
    }
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
    const resolution = isV2
      ? v2Context.resolution
      : requestPayload.resolution === "1080p"
        ? "1080p"
        : "720p";
    const rate = tokenPriced
      ? selectUsageRate(
          current.priceVersion.usageRates,
          resolution,
          hasVideoInput,
        )
      : resolution === "1080p"
        ? current.priceVersion.videoInputRate1080p
        : current.priceVersion.videoInputRate720p;
    if (hasVideoInput && !rate)
      throw new Error(
        "The video-input price snapshot is missing its token rate.",
      );

    const usageProviderCost =
      hasVideoInput || tokenPriced
        ? videoInputProviderCost(BigInt(completionTokens!), rate!)
        : null;
    const configuredProviderCost =
      job.providerModel.providerModelId === "omnihuman-1.5" &&
      current.priceVersion.pricingDimension === "SECOND" &&
      current.quotedUnits !== null
        ? current.priceVersion.providerCostMicroUsd *
          BigInt(current.quotedUnits)
        : null;
    const actualProviderCost = usageProviderCost ?? configuredProviderCost;
    const actualQuote =
      usageProviderCost === null
        ? null
        : createCreditQuote({
            providerCostMicroUsd: usageProviderCost,
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
      ...(hasVideoInput || tokenPriced
        ? {
            metadata: {
              completionTokens,
              rateMicroUsdPerThousandTokens: rate?.toString(),
              workflow:
                typeof requestPayload.workflow === "string"
                  ? requestPayload.workflow
                  : "LEGACY",
              cappedAtReservation: actualQuote!.customerCredits > charge,
            },
          }
        : {}),
    });

    const videoAsset = await tx.asset.findUniqueOrThrow({
      where: { objectKey: videoObjectKey },
    });
    if (videoAsset.status === "PENDING") {
      await finalizeAssetStorage(tx, {
        organizationId: job.organizationId,
        reservedBytes: videoAsset.byteSize,
        actualBytes: storedVideo.byteSize,
      });
    } else if (videoAsset.status !== "READY") {
      throw new Error("Video output reservation is not recoverable.");
    }
    const readyVideo =
      videoAsset.status === "READY"
        ? videoAsset
        : await tx.asset.update({
            where: { id: videoAsset.id },
            data: {
              ...storedVideo,
              status: "READY",
              ...(trustedTalkingAvatarDurationMs
                ? { durationMs: trustedTalkingAvatarDurationMs }
                : {}),
            },
          });

    let readyLastFrameId: string | null = null;
    const lastFrameAsset = wantsLastFrame
      ? await tx.asset.findFirst({
          where: {
            generationJobId: id,
            generationOutputIndex: 1,
            mediaKind: "IMAGE",
          },
        })
      : null;
    if (lastFrameAsset?.status === "PENDING") {
      if (storedLastFrame) {
        await finalizeAssetStorage(tx, {
          organizationId: job.organizationId,
          reservedBytes: lastFrameAsset.byteSize,
          actualBytes: storedLastFrame.byteSize,
        });
        const ready = await tx.asset.update({
          where: { id: lastFrameAsset.id },
          data: { ...storedLastFrame, status: "READY" },
        });
        readyLastFrameId = ready.id;
      } else {
        await releaseAssetStorage(tx, {
          organizationId: job.organizationId,
          reservedBytes: lastFrameAsset.byteSize,
        });
        await tx.asset.update({
          where: { id: lastFrameAsset.id },
          data: {
            status: "DELETED",
            byteSize: 0n,
            deletedAt: new Date(),
            purgeAfter: new Date(),
          },
        });
      }
    } else if (lastFrameAsset?.status === "READY") {
      readyLastFrameId = lastFrameAsset.id;
    }

    await tx.generationJob.update({
      where: { id },
      data: {
        status: "SUCCEEDED",
        actualProviderCostMicroUsd: actualProviderCost,
        providerCostBasis:
          usageProviderCost !== null
            ? "PROVIDER_USAGE"
            : configuredProviderCost !== null
              ? "CONFIGURED_RATE"
              : null,
        actualUnits:
          tokenPriced || hasVideoInput ? completionTokens : current.quotedUnits,
        completedAt: new Date(),
        outputPayload: {
          stored: true,
          assetId: readyVideo.id,
          ...(readyLastFrameId ? { lastFrameAssetId: readyLastFrameId } : {}),
          providerReturnedLastFrame: Boolean(result.lastFrameUrl),
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
        metadata: {
          workflow:
            typeof requestPayload.workflow === "string"
              ? requestPayload.workflow
              : "LEGACY",
          completionTokens,
          chargedCredits: charge.toString(),
          lastFrameStored: Boolean(readyLastFrameId),
        },
      },
    });
    await enqueueGenerationSuccess(tx, { ...job, id }, readyVideo.id);
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
          const usableReference =
            asset.organizationId === job.organizationId &&
            asset.mediaKind === "IMAGE" &&
            asset.status === "READY" &&
            (asset.purpose === "GENERAL" ||
              (asset.purpose === "REFERENCE_INPUT" &&
                asset.storageOwnerUserId === job.createdById));
          if (!usableReference) {
            throw new ProviderRequestError(
              "Reference image is no longer available",
              false,
              { code: "REFERENCE_IMAGE_UNAVAILABLE" },
            );
          }
          try {
            return await referenceImageDataUri({
              organizationId: asset.organizationId,
              objectKey: asset.objectKey,
              mimeType: asset.mimeType,
              storageProvider: asset.storageProvider,
              externalFileId: asset.externalFileId,
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
      const stored = await storeImage(
        asset.objectKey,
        bytes,
        job.organizationId,
        asset.id,
      );
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

    const requestPayload =
      current.requestPayload &&
      typeof current.requestPayload === "object" &&
      !Array.isArray(current.requestPayload)
        ? (current.requestPayload as Record<string, unknown>)
        : {};
    const resolution =
      typeof requestPayload.resolution === "string"
        ? requestPayload.resolution
        : undefined;
    const referenceImageCount = Array.isArray(requestPayload.referenceAssetIds)
      ? requestPayload.referenceAssetIds.length
      : 0;
    const actualProviderCostMicroUsd = getImageGenerationProviderCostMicroUsd({
      providerModelId: current.providerModel.providerModelId,
      baseCostMicroUsd: current.priceVersion.providerCostMicroUsd,
      resolution,
      outputCount: successfulCount,
      referenceImageCount,
    });
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
    include: {
      providerModel: true,
      priceVersion: true,
      inputAssets: { include: { asset: true }, orderBy: { position: "asc" } },
    },
  });
  const voiceOutputAsset = await db.asset.findFirstOrThrow({
    where: {
      generationJobId: id,
      mediaKind: "AUDIO",
      sourceType: "GENERATED",
    },
    select: { id: true, objectKey: true, mimeType: true },
  });
  if (job.status === "PROCESSING") {
    const output = job.outputPayload as {
      stored?: unknown;
      byteSize?: unknown;
      sha256?: unknown;
      originalDurationSeconds?: unknown;
      playbackDurationSeconds?: unknown;
      subtitle?: Prisma.JsonValue;
      longForm?: Prisma.JsonValue;
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
      const byteSize = await storedAssetSize(voiceOutputAsset.objectKey);
      if (byteSize !== output.byteSize) {
        throw new Error("Stored audio size does not match its metadata");
      }
    } catch (error) {
      await recordStorageFailure(id, error, "audio");
      throw error;
    }
    await finalizeVoiceJob(
      id,
      job,
      { byteSize: BigInt(output.byteSize), sha256: output.sha256 },
      voiceOutputAsset.id,
      typeof output.originalDurationSeconds === "number" &&
        Number.isFinite(output.originalDurationSeconds) &&
        output.originalDurationSeconds > 0 &&
        output.originalDurationSeconds <=
          SEED_AUDIO_NATIVE_MAX_SECONDS * SEED_AUDIO_LONG_FORM_MAX_SEGMENTS
        ? output.originalDurationSeconds
        : undefined,
      output.subtitle && typeof output.subtitle === "object"
        ? (output.subtitle as Prisma.InputJsonValue)
        : undefined,
      typeof output.playbackDurationSeconds === "number" &&
        Number.isFinite(output.playbackDurationSeconds) &&
        output.playbackDurationSeconds > 0 &&
        output.playbackDurationSeconds <=
          SEED_AUDIO_NATIVE_MAX_SECONDS * SEED_AUDIO_LONG_FORM_MAX_SEGMENTS
        ? output.playbackDurationSeconds
        : undefined,
      output.longForm && typeof output.longForm === "object"
        ? (output.longForm as Prisma.InputJsonValue)
        : undefined,
    );
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
  let originalDurationSeconds: number | undefined;
  let playbackDurationSeconds: number | undefined;
  let seedAudioSubtitle: Prisma.InputJsonValue | undefined;
  let seedAudioLongForm: Prisma.InputJsonValue | undefined;
  let longFormOutput = false;
  try {
    const payload = job.requestPayload as Record<string, unknown>;
    let providerInput: Record<string, unknown> = payload;
    if (payload.task === "seed-audio") {
      const env = parseServerEnv();
      const base = new URL(env.APP_URL);
      if (job.inputAssets.length && base.protocol !== "https:")
        throw new ProviderRequestError(
          "Provider sources require a public HTTPS app URL",
          false,
          { code: "INVALID_PROVIDER_SOURCE" },
        );
      const audioUrls: string[] = [];
      let imageUrl: string | undefined;
      for (const input of job.inputAssets) {
        const asset = input.asset;
        if (
          asset.organizationId !== job.organizationId ||
          asset.status !== "READY" ||
          (asset.purpose === "REFERENCE_INPUT" &&
            asset.storageOwnerUserId !== job.createdById)
        )
          throw new ProviderRequestError(
            "Generation source media is no longer available",
            false,
            { code: "REFERENCE_MEDIA_UNAVAILABLE" },
          );
        const url = new URL(
          `/api/provider-media/${encodeURIComponent(asset.id)}`,
          base,
        );
        url.searchParams.set("jobId", job.id);
        url.searchParams.set(
          "grant",
          issueProviderMediaGrant({
            secret: env.AUTH_SECRET,
            jobId: job.id,
            assetId: asset.id,
          }),
        );
        if (input.role === "REFERENCE_AUDIO") audioUrls.push(url.toString());
        else if (input.role === "REFERENCE_IMAGE") imageUrl = url.toString();
      }
      const referenceVoiceKeys = Array.isArray(payload.referenceVoiceKeys)
        ? payload.referenceVoiceKeys.filter(
            (key): key is string => typeof key === "string",
          )
        : [];
      let referenceSpeakerIds: string[];
      try {
        referenceSpeakerIds = referenceVoiceKeys.map(
          (key) => resolvePresetVoice(key, "seed-audio-1.0").speakerId,
        );
      } catch {
        throw new ProviderRequestError(
          "A saved voice reference is no longer available",
          false,
          { code: "REFERENCE_VOICE_UNAVAILABLE" },
        );
      }
      providerInput = {
        task: "seed-audio",
        textPrompt: payload.textPrompt,
        referenceAudioUrls: audioUrls,
        referenceSpeakerIds,
        ...(imageUrl ? { referenceImageUrl: imageUrl } : {}),
        format: payload.format,
        sampleRate: payload.sampleRate,
        speechRate: payload.speechRate,
        loudnessRate: payload.loudnessRate,
        pitch: payload.pitch,
        enableSubtitles: payload.enableSubtitles,
        watermark: payload.watermark,
      };
      longFormOutput = payload.longForm === true;
      if (longFormOutput) {
        const textPrompt =
          typeof payload.textPrompt === "string" ? payload.textPrompt : "";
        const estimatedDurationSeconds = Number(
          payload.estimatedDurationSeconds,
        );
        const format = payload.format as SeedAudioFormat;
        const sampleRate = Number(payload.sampleRate);
        const produced = await produceSeedAudioLongForm({
          provider,
          idempotencyKey: job.idempotencyKey,
          modelId: job.providerModel.providerModelId,
          baseProviderInput: providerInput,
          textPrompt,
          estimatedDurationSeconds,
          expectedMediaType: voiceOutputAsset.mimeType,
          format,
          sampleRate,
          maxOutputBytes: SEED_AUDIO_LONG_FORM_MAX_OUTPUT_BYTES,
        });
        originalDurationSeconds = produced.providerDurationSeconds;
        playbackDurationSeconds = produced.playbackDurationSeconds;
        seedAudioSubtitle = produced.subtitle
          ? (produced.subtitle as Prisma.InputJsonObject)
          : undefined;
        seedAudioLongForm = produced.metadata as Prisma.InputJsonObject;
        result = {
          status: "succeeded" as const,
          providerRequestId: produced.providerRequestId,
          inlineOutputs: [
            {
              mediaType: voiceOutputAsset.mimeType,
              dataBase64: produced.audioBytes.toString("base64"),
            },
          ],
          rawUsage: {
            generatedSeconds: produced.providerDurationSeconds,
          },
        };
      }
    }
    if (!result)
      result = await provider.submit({
        idempotencyKey: job.idempotencyKey,
        modelId: job.providerModel.providerModelId,
        mediaKind: "voice",
        input: providerInput,
      });
    if (
      result.status !== "succeeded" ||
      result.inlineOutputs?.length !== 1 ||
      result.inlineOutputs[0]?.mediaType !== voiceOutputAsset.mimeType
    ) {
      throw new ProviderRequestError(
        "BytePlus returned an unexpected voice result",
        true,
        { code: "INVALID_PROVIDER_RESPONSE" },
      );
    }
    const rawOriginalDuration = result.rawUsage?.generatedSeconds;
    if (
      typeof rawOriginalDuration === "number" &&
      Number.isFinite(rawOriginalDuration) &&
      rawOriginalDuration > 0 &&
      rawOriginalDuration <=
        SEED_AUDIO_NATIVE_MAX_SECONDS * SEED_AUDIO_LONG_FORM_MAX_SEGMENTS
    ) {
      originalDurationSeconds = rawOriginalDuration;
      playbackDurationSeconds ??= rawOriginalDuration;
    }
    const rawSubtitle = result.rawUsage?.subtitle;
    if (
      rawSubtitle &&
      typeof rawSubtitle === "object" &&
      !Array.isArray(rawSubtitle)
    )
      seedAudioSubtitle = rawSubtitle as Prisma.InputJsonObject;
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
      const mimeType = voiceOutputAsset.mimeType as
        | "audio/mpeg"
        | "audio/wav"
        | "audio/ogg"
        | "audio/L16";
      stored = longFormOutput
        ? await storeAudio(
            voiceOutputAsset.objectKey,
            audioBytes,
            job.organizationId,
            voiceOutputAsset.id,
            mimeType,
            SEED_AUDIO_LONG_FORM_MAX_OUTPUT_BYTES,
          )
        : await storeAudio(
            voiceOutputAsset.objectKey,
            audioBytes,
            job.organizationId,
            voiceOutputAsset.id,
            mimeType,
          );
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
        ...(originalDurationSeconds ? { originalDurationSeconds } : {}),
        ...(playbackDurationSeconds ? { playbackDurationSeconds } : {}),
        ...(seedAudioSubtitle ? { subtitle: seedAudioSubtitle } : {}),
        ...(seedAudioLongForm ? { longForm: seedAudioLongForm } : {}),
      },
      errorCode: null,
      errorMessage: null,
    },
  });
  if (!persisted.count) return;

  await finalizeVoiceJob(
    id,
    job,
    stored,
    voiceOutputAsset.id,
    originalDurationSeconds,
    seedAudioSubtitle,
    playbackDurationSeconds,
    seedAudioLongForm,
  );
}

async function finalizeVoiceJob(
  id: string,
  job: {
    organizationId: string;
    createdById: string;
    priceVersion: {
      providerCostMicroUsd: bigint;
      unitQuantity: number;
      fxBaisaNumerator: bigint;
      fxBaisaDenominator: bigint;
      targetMarginBps: number;
      creditsPerBaisa: bigint;
    };
  },
  stored: Awaited<ReturnType<typeof storeAudio>>,
  outputAssetId: string,
  originalDurationSeconds?: number,
  seedAudioSubtitle?: Prisma.InputJsonValue,
  playbackDurationSeconds?: number,
  seedAudioLongForm?: Prisma.InputJsonValue,
) {
  let finalBillableQuantity: number | null = null;
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM GenerationJob WHERE id = ${id} FOR UPDATE`;
    const current = await tx.generationJob.findUniqueOrThrow({ where: { id } });
    if (current.status !== "PROCESSING") return;
    const payload = current.requestPayload as Record<string, unknown>;
    const seedAudio = payload.task === "seed-audio";
    const actualSeconds =
      seedAudio && originalDurationSeconds !== undefined
        ? Math.ceil(originalDurationSeconds)
        : null;
    const actualUnits =
      actualSeconds === null
        ? (current.quotedUnits ?? 1)
        : Number(
            (BigInt(actualSeconds) +
              BigInt(job.priceVersion.unitQuantity) -
              1n) /
              BigInt(job.priceVersion.unitQuantity),
          );
    const chargedCredits =
      actualSeconds === null
        ? current.reservedCredits
        : createCreditQuote({
            providerCostMicroUsd:
              job.priceVersion.providerCostMicroUsd * BigInt(actualUnits),
            exchangeRate: {
              baisaNumerator: job.priceVersion.fxBaisaNumerator,
              baisaDenominator: job.priceVersion.fxBaisaDenominator,
            },
            targetGrossMarginBps: job.priceVersion.targetMarginBps,
            creditsPerBaisa: job.priceVersion.creditsPerBaisa,
          }).customerCredits;
    finalBillableQuantity = actualSeconds ?? current.billableQuantity;
    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { organizationId: job.organizationId },
    });
    await captureCreditsForJob(tx, {
      walletId: wallet.id,
      jobId: id,
      amountCredits: chargedCredits,
      idempotencyKey: `generation-capture-${id}`,
    });
    const pendingAsset = await tx.asset.findUniqueOrThrow({
      where: { id: outputAssetId },
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
      where: { id: outputAssetId },
      data: {
        ...stored,
        status: "READY",
        ...(playbackDurationSeconds
          ? { durationMs: Math.round(playbackDurationSeconds * 1000) }
          : {}),
      },
    });
    await tx.generationJob.update({
      where: { id },
      data: {
        status: "SUCCEEDED",
        actualUnits,
        billableQuantity: actualSeconds ?? current.billableQuantity,
        providerCostBasis: seedAudio
          ? "PROVIDER_ORIGINAL_SECONDS"
          : "CONFIGURED_CHARACTERS",
        actualProviderCostMicroUsd: seedAudio
          ? job.priceVersion.providerCostMicroUsd * BigInt(actualUnits)
          : current.billableQuantity == null
            ? null
            : (job.priceVersion.providerCostMicroUsd *
                BigInt(current.billableQuantity ?? 0) +
                BigInt(job.priceVersion.unitQuantity) -
                1n) /
              BigInt(job.priceVersion.unitQuantity),
        completedAt: new Date(),
        outputPayload: {
          stored: true,
          byteSize: Number(stored.byteSize),
          sha256: stored.sha256,
          ...(originalDurationSeconds ? { originalDurationSeconds } : {}),
          ...(playbackDurationSeconds ? { playbackDurationSeconds } : {}),
          ...(seedAudioSubtitle ? { subtitle: seedAudioSubtitle } : {}),
          ...(seedAudioLongForm ? { longForm: seedAudioLongForm } : {}),
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

  if (typeof finalBillableQuantity === "number") {
    try {
      const trialUsage = await calculateSpeechTrialUsage();
      logSpeechTrialTelemetry(id, finalBillableQuantity, trialUsage);
    } catch {
      // Non-fatal telemetry logging
    }
  }
}
