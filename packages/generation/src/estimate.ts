import { db } from "@aiwa/db";
import { estimateGeneration, type PriceSnapshot } from "@aiwa/credits";

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
  durationSeconds?: number;
  resolution?: string;
  aspectRatio?: string;
  generateAudio?: boolean;
  referenceVideoAssetId?: string;
  firstFrameAssetId?: string;
  lastFrameAssetId?: string;
  audioAssetId?: string;
  referenceAssetIds: string[];
}
export async function estimateAuthorizedGeneration(
  model: { mediaKind: string; providerModelId: string; capabilities: unknown },
  activePriceVersion: PriceSnapshot,
  input: QuoteInput,
  organizationId: string,
  userId: string,
) {
  const {
    units,
    text,
    billableQuantity,
    durationSeconds,
    resolution,
    generateAudio,
    referenceVideoAssetId,
    audioAssetId,
  } = input;
  const session = { user: { id: userId } };
  let inputDurationMs: number | undefined;
  const caps = (
    model.capabilities &&
    typeof model.capabilities === "object" &&
    !Array.isArray(model.capabilities)
      ? model.capabilities
      : {}
  ) as Record<string, unknown>;
  const normalizedResolution =
    resolution ?? (model.mediaKind === "VIDEO" ? "720p" : "2K");
  const normalizedRatio =
    input.aspectRatio ?? (model.mediaKind === "VIDEO" ? "16:9" : "1:1");
  if (model.mediaKind === "REASONING")
    throw new QuoteValidationError(
      "This model has no registered generation estimator.",
      400,
    );
  if (model.mediaKind === "VIDEO" || model.mediaKind === "IMAGE") {
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
    const minDur =
      typeof caps.minimumDurationSeconds === "number"
        ? caps.minimumDurationSeconds
        : 4;
    const maxDur =
      typeof caps.maximumDurationSeconds === "number"
        ? caps.maximumDurationSeconds
        : 30;
    const dur = durationSeconds ?? 5;
    const isSupportedDuration =
      caps["durationSeconds:" + dur] === true ||
      (dur >= minDur && dur <= maxDur);
    if (!isSupportedDuration || (generateAudio && caps.generateAudio !== true))
      throw new QuoteValidationError(
        "Duration or audio setting is unsupported.",
        400,
      );
    const frames = [input.firstFrameAssetId, input.lastFrameAssetId].filter(
      (id): id is string => Boolean(id),
    );
    if (
      (input.lastFrameAssetId && !input.firstFrameAssetId) ||
      (frames.length &&
        (referenceVideoAssetId ||
          (normalizedRatio !== "adaptive" && !audioAssetId)))
    )
      throw new QuoteValidationError("Invalid video input combination.", 400);
    if (frames.length) {
      const assets = await db.asset.findMany({
        where: {
          id: { in: frames },
          organizationId,
          mediaKind: "IMAGE",
          status: "READY",
          storageProvider: "LOCAL",
          OR: [
            { purpose: "GENERAL" },
            { purpose: "REFERENCE_INPUT", storageOwnerUserId: session.user.id },
          ],
        },
        select: { id: true },
      });
      if (
        assets.length !== new Set(frames).size ||
        caps.firstFrame !== true ||
        (frames.length > 1 && caps.lastFrame !== true)
      )
        throw new QuoteValidationError("Source image is unavailable.", 400);
    }
  }
  if (audioAssetId) {
    if (caps.audioInput !== true)
      throw new QuoteValidationError(
        "Audio input is unsupported for this model.",
        400,
      );
    const audio = await db.asset.findFirst({
      where: {
        id: audioAssetId,
        organizationId,
        mediaKind: "AUDIO",
        status: "READY",
        storageProvider: "LOCAL",
        OR: [
          { purpose: "GENERAL" },
          { purpose: "REFERENCE_INPUT", storageOwnerUserId: session.user.id },
        ],
      },
      select: { durationMs: true },
    });
    if (!audio)
      throw new QuoteValidationError("Driving audio is unavailable.", 400);
  }
  if (referenceVideoAssetId) {
    if (caps.referenceVideo !== true)
      throw new QuoteValidationError("Video reference is unsupported.", 400);
    const source = await db.asset.findFirst({
      where: {
        id: referenceVideoAssetId,
        organizationId,
        mediaKind: "VIDEO",
        status: "READY",
        storageProvider: "LOCAL",
        mimeType: "video/mp4",
        OR: [
          { purpose: "GENERAL" },
          { purpose: "REFERENCE_INPUT", storageOwnerUserId: session.user.id },
        ],
      },
      select: { durationMs: true, width: true, height: true, byteSize: true },
    });
    if (
      !source?.durationMs ||
      source.durationMs < 2000 ||
      source.durationMs > 30000 ||
      source.width === null ||
      source.height === null ||
      source.width < 300 ||
      source.height < 300 ||
      source.width * source.height < 407696 ||
      source.width * source.height > 8295044 ||
      source.width / source.height < 0.4 ||
      source.width / source.height > 2.5 ||
      source.byteSize > 100000000n
    )
      throw new QuoteValidationError(
        "Reference video is unavailable or outside provider limits.",
        400,
      );
    inputDurationMs = source.durationMs;
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
            { purpose: "REFERENCE_INPUT", storageOwnerUserId: session.user.id },
          ],
        },
        select: { id: true, byteSize: true },
      });
      if (
        assets.length !== referenceIds.length ||
        assets.reduce((sum, a) => sum + a.byteSize, 0n) > 80n * 1024n * 1024n
      )
        throw new QuoteValidationError(
          "Reference images are unavailable or too large.",
          400,
        );
    }
  }
  let estimate: ReturnType<typeof estimateGeneration>;
  try {
    estimate = estimateGeneration({
      price: activePriceVersion,
      mediaKind: model.mediaKind,
      providerModelId: model.providerModelId,
      units,
      text,
      billableQuantity,
      durationSeconds,
      resolution: normalizedResolution,
      aspectRatio: normalizedRatio,
      generateAudio,
      inputDurationMs,
      referenceImageCount: referenceIds.length,
    });
  } catch (error) {
    throw new QuoteValidationError(
      error instanceof Error ? error.message : "Pricing is unavailable.",
      409,
    );
  }

  return estimate;
}
