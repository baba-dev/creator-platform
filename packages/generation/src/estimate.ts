import { db } from "@aiwa/db";
import { estimateGeneration, type PriceSnapshot } from "@aiwa/credits";
import {
  validateVideoModelRequest,
  videoRequestV2Schema,
  type VideoRequestV2,
  type VideoSource,
} from "./video-contract";
import { inspectTalkingAvatarSources } from "./talking-avatar";

export class QuoteValidationError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

interface QuoteInput {
  units: number;
  text?: string;
  billableQuantity?: number;
  schemaVersion?: number;
  workflow?: VideoRequestV2["workflow"];
  sources?: VideoSource[];
  durationSeconds?: number;
  resolution?: string;
  aspectRatio?: string;
  generateAudio?: boolean;
  referenceVideoAssetId?: string;
  firstFrameAssetId?: string;
  lastFrameAssetId?: string;
  referenceAssetIds: string[];
  outputFormat?: "mp4" | "mov";
  returnLastFrame?: boolean;
  seed?: number;
  sourceDraftJobId?: string;
  extensionDirection?: "BEFORE" | "AFTER";
  task?: "seed-audio";
  referenceAudioAssetIds?: string[];
  referenceImageAssetId?: string;
  estimatedDurationSeconds?: number;
}

function legacyVideoSources(input: QuoteInput): VideoSource[] {
  const sources: VideoSource[] = [];
  if (input.firstFrameAssetId)
    sources.push({
      assetId: input.firstFrameAssetId,
      role: "FIRST_FRAME",
      position: sources.length,
    });
  if (input.lastFrameAssetId)
    sources.push({
      assetId: input.lastFrameAssetId,
      role: "LAST_FRAME",
      position: sources.length,
    });
  if (input.referenceVideoAssetId)
    sources.push({
      assetId: input.referenceVideoAssetId,
      role: "REFERENCE_VIDEO",
      position: sources.length,
    });
  return sources;
}

function inferLegacyWorkflow(input: QuoteInput): VideoRequestV2["workflow"] {
  if (input.referenceVideoAssetId) return "REFERENCE";
  if (input.lastFrameAssetId) return "FIRST_LAST_FRAME";
  if (input.firstFrameAssetId) return "FRAME_TO_VIDEO";
  return "GENERATE";
}

export async function estimateAuthorizedGeneration(
  model: { mediaKind: string; providerModelId: string; capabilities: unknown },
  activePriceVersion: PriceSnapshot,
  input: QuoteInput,
  organizationId: string,
  userId: string,
) {
  const { units, text, billableQuantity } = input;
  const caps = (
    model.capabilities &&
    typeof model.capabilities === "object" &&
    !Array.isArray(model.capabilities)
      ? model.capabilities
      : {}
  ) as Record<string, unknown>;
  let normalizedResolution =
    input.resolution ?? (model.mediaKind === "VIDEO" ? "720p" : "2K");
  let normalizedRatio =
    input.aspectRatio ?? (model.mediaKind === "VIDEO" ? "16:9" : "1:1");
  let pricingDurationSeconds = input.durationSeconds ?? 5;
  let pricingGenerateAudio = input.generateAudio ?? false;
  let totalInputVideoDurationMs: number | undefined;

  if (model.mediaKind === "REASONING")
    throw new QuoteValidationError(
      "This model has no registered generation estimator.",
      400,
    );

  if (model.mediaKind === "VOICE" && input.task === "seed-audio") {
    if (model.providerModelId !== "seed-audio-1.0")
      throw new QuoteValidationError(
        "This model does not support Seed Audio generation.",
        400,
      );
    const audioIds = input.referenceAudioAssetIds ?? [];
    const sourceIds = [
      ...audioIds,
      ...(input.referenceImageAssetId ? [input.referenceImageAssetId] : []),
    ];
    if (input.referenceImageAssetId && audioIds.length)
      throw new QuoteValidationError(
        "Image and audio references cannot be combined.",
        400,
      );
    if (sourceIds.length) {
      const assets = await db.asset.findMany({
        where: {
          id: { in: sourceIds },
          organizationId,
          status: "READY",
          storageProvider: "LOCAL",
          OR: [
            { purpose: "GENERAL" },
            { purpose: "REFERENCE_INPUT", storageOwnerUserId: userId },
          ],
        },
        select: {
          id: true,
          mediaKind: true,
          mimeType: true,
          byteSize: true,
          durationMs: true,
        },
      });
      if (assets.length !== sourceIds.length)
        throw new QuoteValidationError("Reference media is unavailable.", 400);
      for (const asset of assets) {
        const audio = audioIds.includes(asset.id);
        if (
          audio &&
          (asset.mediaKind !== "AUDIO" ||
            asset.durationMs === null ||
            asset.durationMs > 30_000 ||
            asset.byteSize > 10n * 1024n * 1024n)
        )
          throw new QuoteValidationError(
            "Reference audio exceeds Seed Audio limits.",
            400,
          );
        if (
          !audio &&
          (asset.mediaKind !== "IMAGE" || asset.byteSize > 10n * 1024n * 1024n)
        )
          throw new QuoteValidationError(
            "Reference image exceeds Seed Audio limits.",
            400,
          );
      }
    }
  }

  if (model.mediaKind === "IMAGE") {
    if (
      caps["resolution:" + normalizedResolution] !== true ||
      caps["aspectRatio:" + normalizedRatio] !== true
    )
      throw new QuoteValidationError(
        "Resolution or aspect ratio is unsupported.",
        400,
      );
  }

  if (model.mediaKind === "VIDEO") {
    const rawSources = input.sources ?? legacyVideoSources(input);
    const candidate = videoRequestV2Schema.safeParse({
      schemaVersion: 2,
      organizationId,
      modelId: "quote-model",
      priceVersionId: "quote-price",
      idempotencyKey: "00000000-0000-4000-8000-000000000000",
      workflow: input.workflow ?? inferLegacyWorkflow(input),
      prompt:
        (input.workflow ?? inferLegacyWorkflow(input)) === "DRAFT_FINAL"
          ? ""
          : "quote-validation",
      sources: rawSources,
      aspectRatio: normalizedRatio,
      resolution: normalizedResolution,
      durationSeconds: pricingDurationSeconds,
      generateAudio: pricingGenerateAudio,
      outputFormat: input.outputFormat ?? "mp4",
      returnLastFrame: input.returnLastFrame ?? true,
      ...(input.seed === undefined ? {} : { seed: input.seed }),
      ...(input.sourceDraftJobId
        ? { sourceDraftJobId: input.sourceDraftJobId }
        : {}),
      ...(input.extensionDirection
        ? { extensionDirection: input.extensionDirection }
        : {}),
    });
    if (!candidate.success)
      throw new QuoteValidationError(
        candidate.error.issues[0]?.message ??
          "Invalid video input combination.",
        400,
      );
    const video = candidate.data;
    const capabilityError = validateVideoModelRequest(
      model.providerModelId,
      model.capabilities,
      video,
    );
    if (capabilityError) throw new QuoteValidationError(capabilityError, 400);

    const sourceIds = video.sources.map((source) => source.assetId);
    const assets = sourceIds.length
      ? await db.asset.findMany({
          where: {
            id: { in: sourceIds },
            organizationId,
            status: "READY",
            storageProvider: "LOCAL",
            OR: [
              { purpose: "GENERAL" },
              { purpose: "REFERENCE_INPUT", storageOwnerUserId: userId },
            ],
          },
          select: {
            id: true,
            mediaKind: true,
            mimeType: true,
            byteSize: true,
            durationMs: true,
            width: true,
            height: true,
          },
        })
      : [];
    const assetById = new Map(assets.map((asset) => [asset.id, asset]));
    if (assets.length !== sourceIds.length)
      throw new QuoteValidationError("Source media is unavailable.", 400);

    const maxVideoInputSeconds =
      typeof caps.maxReferenceVideoDurationSeconds === "number"
        ? caps.maxReferenceVideoDurationSeconds
        : model.providerModelId.startsWith("dreamina-seedance-2-5-")
          ? 30
          : 15;
    const maxAudioInputSeconds =
      typeof caps.maxReferenceAudioDurationSeconds === "number"
        ? caps.maxReferenceAudioDurationSeconds
        : maxVideoInputSeconds;
    let inputVideoMs = 0;
    let inputAudioMs = 0;

    for (const source of video.sources) {
      const asset = assetById.get(source.assetId);
      if (!asset)
        throw new QuoteValidationError("Source media is unavailable.", 400);
      const image =
        source.role === "FIRST_FRAME" ||
        source.role === "LAST_FRAME" ||
        source.role === "REFERENCE_IMAGE" ||
        source.role === "AVATAR_IMAGE";
      const videoInput =
        source.role === "REFERENCE_VIDEO" || source.role === "SOURCE_VIDEO";
      const audio =
        source.role === "REFERENCE_AUDIO" || source.role === "DRIVING_AUDIO";
      if (
        (image && asset.mediaKind !== "IMAGE") ||
        (videoInput && asset.mediaKind !== "VIDEO") ||
        (audio && asset.mediaKind !== "AUDIO")
      )
        throw new QuoteValidationError(
          "Source role does not match the asset type.",
          400,
        );
      if (
        image &&
        source.role !== "AVATAR_IMAGE" &&
        (asset.byteSize > 20n * 1024n * 1024n ||
          !asset.mimeType.startsWith("image/"))
      )
        throw new QuoteValidationError(
          "Reference image is outside provider limits.",
          400,
        );
      if (videoInput) {
        if (
          asset.durationMs === null ||
          asset.durationMs < 2_000 ||
          asset.durationMs > maxVideoInputSeconds * 1000 ||
          asset.width === null ||
          asset.height === null ||
          asset.width < 300 ||
          asset.height < 300 ||
          asset.width * asset.height < 407_696 ||
          asset.width * asset.height > 8_295_044 ||
          asset.width / asset.height < 0.4 ||
          asset.width / asset.height > 2.5 ||
          asset.byteSize > 100_000_000n ||
          !["video/mp4", "video/quicktime"].includes(asset.mimeType)
        )
          throw new QuoteValidationError(
            "Reference video is outside provider limits.",
            400,
          );
        if (
          source.role === "SOURCE_VIDEO" &&
          video.workflow === "EDIT" &&
          asset.durationMs < 4_000
        )
          throw new QuoteValidationError(
            "Video editing requires at least four seconds of source video.",
            400,
          );
        inputVideoMs += asset.durationMs;
      }
      if (audio && source.role !== "DRIVING_AUDIO") {
        if (
          asset.durationMs === null ||
          asset.durationMs < 2_000 ||
          asset.durationMs > maxAudioInputSeconds * 1000 ||
          asset.byteSize > 15n * 1024n * 1024n ||
          !["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"].includes(
            asset.mimeType,
          )
        )
          throw new QuoteValidationError(
            "Reference audio is outside provider limits.",
            400,
          );
        inputAudioMs += asset.durationMs;
      }
    }
    if (inputVideoMs > maxVideoInputSeconds * 1000)
      throw new QuoteValidationError(
        "Combined reference video duration exceeds the model limit.",
        400,
      );
    if (inputAudioMs > maxAudioInputSeconds * 1000)
      throw new QuoteValidationError(
        "Combined reference audio duration exceeds the model limit.",
        400,
      );

    totalInputVideoDurationMs = inputVideoMs > 0 ? inputVideoMs : undefined;
    normalizedResolution = video.resolution;
    normalizedRatio = video.aspectRatio;
    pricingDurationSeconds =
      video.durationSeconds === -1 ? 5 : video.durationSeconds;
    pricingGenerateAudio = video.generateAudio;

    if (video.workflow === "TALKING_AVATAR") {
      try {
        const facts = inspectTalkingAvatarSources(video, assetById);
        pricingDurationSeconds = facts.billableDurationSeconds;
        normalizedRatio = "adaptive";
        pricingGenerateAudio = false;
      } catch (error) {
        throw new QuoteValidationError(
          error instanceof Error
            ? error.message
            : "Talking-avatar source media is invalid.",
          400,
        );
      }
    }

    if (video.workflow === "EDIT") {
      const source = video.sources.find((item) => item.role === "SOURCE_VIDEO");
      const sourceAsset = source ? assetById.get(source.assetId) : undefined;
      pricingDurationSeconds = Math.max(
        4,
        Math.min(30, Math.ceil((sourceAsset?.durationMs ?? 5_000) / 1000)),
      );
    }

    if (video.workflow === "DRAFT_FINAL") {
      const draft = await db.generationJob.findFirst({
        where: {
          id: video.sourceDraftJobId!,
          organizationId,
          createdById: userId,
          status: "SUCCEEDED",
        },
        include: {
          providerModel: { select: { providerModelId: true } },
          inputAssets: { include: { asset: true } },
        },
      });
      if (
        !draft?.providerRequestId ||
        draft.providerModel.providerModelId !== model.providerModelId ||
        Date.now() - draft.createdAt.getTime() >= 7 * 24 * 60 * 60 * 1000
      )
        throw new QuoteValidationError(
          "The source Draft is unavailable or has expired.",
          409,
        );
      const draftPayload = draft.requestPayload as Record<string, unknown>;
      if (draftPayload.schemaVersion !== 2 || draftPayload.workflow !== "DRAFT")
        throw new QuoteValidationError(
          "The selected job is not a Seedance 2.5 Draft.",
          409,
        );
      pricingDurationSeconds =
        typeof draftPayload.durationSeconds === "number"
          ? draftPayload.durationSeconds
          : 5;
      normalizedRatio =
        typeof draftPayload.aspectRatio === "string"
          ? draftPayload.aspectRatio
          : "16:9";
      pricingGenerateAudio = draftPayload.generateAudio === true;
      const originalVideoMs = draft.inputAssets.reduce(
        (sum, item) =>
          item.asset.mediaKind === "VIDEO"
            ? sum + (item.asset.durationMs ?? 0)
            : sum,
        0,
      );
      totalInputVideoDurationMs =
        originalVideoMs > 0 ? originalVideoMs : undefined;
    }
  }

  const referenceIds = input.referenceAssetIds;
  if (referenceIds.length && model.mediaKind !== "IMAGE")
    throw new QuoteValidationError(
      "Image references require an image model.",
      400,
    );

  if (model.mediaKind === "IMAGE") {
    const maxOutput =
      typeof caps.maxGeneratedImages === "number" ? caps.maxGeneratedImages : 1;
    const maxReferences =
      typeof caps.maxReferenceImages === "number" ? caps.maxReferenceImages : 0;
    const maxTotalImages =
      typeof caps.maxTotalInputOutputImages === "number"
        ? caps.maxTotalInputOutputImages
        : maxOutput;
    if (
      (referenceIds.length > 0 && caps.referenceImages !== true) ||
      units > maxOutput ||
      referenceIds.length > maxReferences ||
      units + referenceIds.length > maxTotalImages ||
      new Set(referenceIds).size !== referenceIds.length
    )
      throw new QuoteValidationError(
        "Image count is outside model limits.",
        400,
      );
    if (referenceIds.length) {
      const assets = await db.asset.findMany({
        where: {
          id: { in: referenceIds },
          organizationId,
          mediaKind: "IMAGE",
          status: "READY",
          storageProvider: "LOCAL",
          OR: [
            { purpose: "GENERAL" },
            { purpose: "REFERENCE_INPUT", storageOwnerUserId: userId },
          ],
        },
        select: { id: true, byteSize: true },
      });
      if (
        assets.length !== referenceIds.length ||
        assets.reduce((sum, asset) => sum + asset.byteSize, 0n) >
          80n * 1024n * 1024n
      )
        throw new QuoteValidationError(
          "Reference images are unavailable or too large.",
          400,
        );
    }
  }

  try {
    return estimateGeneration({
      price: activePriceVersion,
      mediaKind: model.mediaKind,
      providerModelId: model.providerModelId,
      units,
      text,
      billableQuantity:
        input.task === "seed-audio"
          ? input.estimatedDurationSeconds
          : billableQuantity,
      durationSeconds:
        input.task === "seed-audio"
          ? input.estimatedDurationSeconds
          : pricingDurationSeconds,
      resolution: normalizedResolution,
      aspectRatio: normalizedRatio,
      generateAudio: pricingGenerateAudio,
      totalInputVideoDurationMs,
      referenceImageCount: referenceIds.length,
    });
  } catch (error) {
    throw new QuoteValidationError(
      error instanceof Error ? error.message : "Pricing is unavailable.",
      409,
    );
  }
}
