import { db } from "@aiwa/db";

export const AVAILABLE_GENERATION_ACTIONS = [
  "animate",
  "variations",
  "aspect_ratio",
  "edit",
  "switch_model",
  "extend",
  "speech_rate",
] as const;

export type AvailableGenerationAction =
  (typeof AVAILABLE_GENERATION_ACTIONS)[number];

type CapabilityRecord = Record<string, unknown>;

export interface ActionAvailabilityModel {
  id: string;
  providerModelId: string;
  mediaKind: string;
  capabilities: unknown;
}

export interface ActionAvailabilityJob {
  id: string;
  status: string;
  assets: Array<{ mimeType: string }>;
  requestPayload?: unknown;
  providerModel?: {
    id: string;
    providerModelId?: string | null;
    mediaKind: string;
    capabilities?: unknown;
  } | null;
}

function capabilities(value: unknown): CapabilityRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as CapabilityRecord)
    : {};
}

function mediaKind(value: string): string {
  return value.trim().toUpperCase();
}

function requestSettings(job: ActionAvailabilityJob): {
  aspectRatio?: string;
  resolution?: string;
} {
  const payload = capabilities(job.requestPayload);
  return {
    aspectRatio:
      typeof payload.aspectRatio === "string" ? payload.aspectRatio : undefined,
    resolution:
      typeof payload.resolution === "string" ? payload.resolution : undefined,
  };
}

function supportsSetting(
  model: ActionAvailabilityModel,
  name: "aspectRatio" | "resolution",
  value: string | undefined,
): boolean {
  if (!value) return true;
  const caps = capabilities(model.capabilities);
  const prefix = `${name}:`;
  const advertised = Object.keys(caps).filter((key) => key.startsWith(prefix));
  return advertised.length === 0 || caps[`${prefix}${value}`] === true;
}

function supportsImageSettings(
  model: ActionAvailabilityModel,
  settings: ReturnType<typeof requestSettings>,
): boolean {
  return (
    supportsSetting(model, "aspectRatio", settings.aspectRatio) &&
    supportsSetting(model, "resolution", settings.resolution)
  );
}

function isUsableVideoModel(model: ActionAvailabilityModel): boolean {
  const caps = capabilities(model.capabilities);
  return mediaKind(model.mediaKind) === "VIDEO" && caps.talkingAvatar !== true;
}

function hasDifferentModel(
  models: readonly ActionAvailabilityModel[],
  job: ActionAvailabilityJob,
  kind: "IMAGE" | "VIDEO",
  predicate?: (model: ActionAvailabilityModel) => boolean,
): boolean {
  const currentIds = new Set(
    [job.providerModel?.id, job.providerModel?.providerModelId].filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    ),
  );
  return models.some(
    (model) =>
      mediaKind(model.mediaKind) === kind &&
      !currentIds.has(model.id) &&
      !currentIds.has(model.providerModelId) &&
      (predicate?.(model) ?? true),
  );
}

export function computeAvailableGenerationActions(
  job: ActionAvailabilityJob,
  models: readonly ActionAvailabilityModel[],
): AvailableGenerationAction[] {
  if (job.status !== "SUCCEEDED" || job.assets.length === 0) return [];

  const kind = mediaKind(job.providerModel?.mediaKind ?? "");
  const settings = requestSettings(job);
  const hasImage = job.assets.some((asset) =>
    asset.mimeType.startsWith("image/"),
  );
  const hasVideo = job.assets.some((asset) =>
    asset.mimeType.startsWith("video/"),
  );
  const actions = new Set<AvailableGenerationAction>();

  if (kind === "IMAGE" && hasImage) {
    const imageModels = models.filter(
      (model) => mediaKind(model.mediaKind) === "IMAGE",
    );
    const canAnimate = models.some((model) => {
      if (!isUsableVideoModel(model)) return false;
      const caps = capabilities(model.capabilities);
      return (
        caps.firstFrame === true &&
        supportsSetting(model, "aspectRatio", "adaptive") &&
        supportsSetting(model, "resolution", "720p")
      );
    });
    const canCreateVariations = imageModels.some((model) => {
      const caps = capabilities(model.capabilities);
      const maxGenerated =
        typeof caps.maxGeneratedImages === "number"
          ? caps.maxGeneratedImages
          : 1;
      const maxTotal =
        typeof caps.maxTotalInputOutputImages === "number"
          ? caps.maxTotalInputOutputImages
          : maxGenerated;
      return (
        caps.referenceImages === true &&
        caps.sequentialImages === true &&
        maxGenerated >= 4 &&
        maxTotal >= 5 &&
        supportsImageSettings(model, settings)
      );
    });
    const canReframe = imageModels.some((model) => {
      const caps = capabilities(model.capabilities);
      return (
        caps.referenceImages === true &&
        caps["aspectRatio:9:16"] === true &&
        caps["aspectRatio:16:9"] === true &&
        supportsSetting(model, "resolution", settings.resolution)
      );
    });
    const canEdit = imageModels.some(
      (model) =>
        capabilities(model.capabilities).referenceImages === true &&
        supportsImageSettings(model, settings),
    );
    const canSwitch = hasDifferentModel(models, job, "IMAGE", (model) => {
      return (
        capabilities(model.capabilities).referenceImages === true &&
        supportsImageSettings(model, settings)
      );
    });

    if (canAnimate) actions.add("animate");
    if (canCreateVariations) actions.add("variations");
    if (canReframe) actions.add("aspect_ratio");
    if (canEdit) actions.add("edit");
    if (canSwitch) actions.add("switch_model");
  } else if (kind === "VIDEO" && hasVideo) {
    if (
      models.some(
        (model) =>
          isUsableVideoModel(model) &&
          capabilities(model.capabilities).extendVideo === true &&
          supportsSetting(model, "aspectRatio", "adaptive") &&
          supportsSetting(model, "resolution", settings.resolution),
      )
    ) {
      actions.add("extend");
    }
    if (
      hasDifferentModel(
        models,
        job,
        "VIDEO",
        (model) =>
          isUsableVideoModel(model) &&
          supportsSetting(model, "aspectRatio", settings.aspectRatio) &&
          supportsSetting(model, "resolution", settings.resolution),
      )
    ) {
      actions.add("switch_model");
    }
  } else if (kind === "VOICE") {
    const currentCaps = capabilities(job.providerModel?.capabilities);
    if (currentCaps.speechRate === true) actions.add("speech_rate");
  }

  return AVAILABLE_GENERATION_ACTIONS.filter((action) => actions.has(action));
}

/**
 * Resolve action affordances from the same enabled, actively-priced provider
 * catalog used by creative routing. One catalog query serves the whole job
 * batch so conversation refreshes do not introduce per-job database queries.
 */
export async function resolveAvailableGenerationActions(
  jobs: readonly ActionAvailabilityJob[],
): Promise<Map<string, AvailableGenerationAction[]>> {
  if (jobs.length === 0) return new Map();

  const now = new Date();
  const models = await db.providerModel.findMany({
    where: {
      provider: "BYTEPLUS",
      enabled: true,
      mediaKind: { in: ["IMAGE", "VIDEO", "VOICE"] },
      priceVersions: {
        some: {
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
      },
    },
    select: {
      id: true,
      providerModelId: true,
      mediaKind: true,
      capabilities: true,
    },
  });

  return new Map(
    jobs.map((job) => [
      job.id,
      computeAvailableGenerationActions(job, models),
    ]),
  );
}
