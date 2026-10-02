import { z } from "zod";

export const videoWorkflowSchema = z.enum([
  "GENERATE",
  "FRAME_TO_VIDEO",
  "FIRST_LAST_FRAME",
  "REFERENCE",
  "EDIT",
  "EXTEND",
  "DRAFT",
  "DRAFT_FINAL",
  "TALKING_AVATAR",
]);
export type VideoWorkflow = z.infer<typeof videoWorkflowSchema>;

export const videoSourceRoleSchema = z.enum([
  "FIRST_FRAME",
  "LAST_FRAME",
  "REFERENCE_IMAGE",
  "REFERENCE_VIDEO",
  "REFERENCE_AUDIO",
  "SOURCE_VIDEO",
  "AVATAR_IMAGE",
  "DRIVING_AUDIO",
]);
export type VideoSourceRole = z.infer<typeof videoSourceRoleSchema>;

export const videoSourceSchema = z
  .object({
    assetId: z.string().min(1).max(100),
    role: videoSourceRoleSchema,
    position: z.number().int().min(0).max(49),
  })
  .strict();
export type VideoSource = z.infer<typeof videoSourceSchema>;

const aspectRatioSchema = z.enum([
  "16:9",
  "9:16",
  "1:1",
  "4:3",
  "3:4",
  "21:9",
  "adaptive",
]);
const resolutionSchema = z.enum(["480p", "720p", "1080p", "4K"]);

export const videoRequestV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    organizationId: z.string().min(1).max(100),
    projectId: z.string().min(1).max(100).nullable().optional(),
    modelId: z.string().min(1).max(100),
    priceVersionId: z.string().min(1).max(100),
    quoteToken: z.string().min(1).max(2048).optional(),
    idempotencyKey: z.uuid(),
    templateId: z.string().min(1).max(100).optional(),
    workflow: videoWorkflowSchema,
    prompt: z.string().trim().max(4000).default(""),
    sources: z.array(videoSourceSchema).max(50).default([]),
    aspectRatio: aspectRatioSchema.default("16:9"),
    resolution: resolutionSchema.default("720p"),
    durationSeconds: z.number().int().min(-1).max(30).default(5),
    generateAudio: z.boolean().default(false),
    outputFormat: z.enum(["mp4", "mov"]).default("mp4"),
    returnLastFrame: z.boolean().default(true),
    seed: z.number().int().min(-1).max(2_147_483_647).optional(),
    sourceDraftJobId: z.string().min(1).max(100).optional(),
    extensionDirection: z.enum(["BEFORE", "AFTER"]).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.sources.map((source) => source.assetId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["sources"],
        message: "A source asset can only be used once in a video request.",
      });
    }
    const positions = value.sources.map((source) => source.position);
    if (new Set(positions).size !== positions.length) {
      context.addIssue({
        code: "custom",
        path: ["sources"],
        message: "Video source positions must be unique.",
      });
    }

    const count = (role: VideoSourceRole) =>
      value.sources.filter((source) => source.role === role).length;
    const frameCount = count("FIRST_FRAME") + count("LAST_FRAME");
    const referenceCount =
      count("REFERENCE_IMAGE") +
      count("REFERENCE_VIDEO") +
      count("REFERENCE_AUDIO");

    if (
      value.workflow !== "DRAFT_FINAL" &&
      value.workflow !== "TALKING_AVATAR" &&
      value.prompt.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["prompt"],
        message: "A prompt is required for this video workflow.",
      });
    }

    if (count("LAST_FRAME") > 0 && count("FIRST_FRAME") !== 1) {
      context.addIssue({
        code: "custom",
        path: ["sources"],
        message: "A last frame requires exactly one first frame.",
      });
    }

    if (
      value.workflow === "FRAME_TO_VIDEO" &&
      (count("FIRST_FRAME") !== 1 || count("LAST_FRAME") !== 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["sources"],
        message: "Frame-to-video requires exactly one first frame.",
      });
    }
    if (
      value.workflow === "FIRST_LAST_FRAME" &&
      (count("FIRST_FRAME") !== 1 || count("LAST_FRAME") !== 1)
    ) {
      context.addIssue({
        code: "custom",
        path: ["sources"],
        message:
          "First/last-frame video requires one first and one last frame.",
      });
    }

    if (
      (value.workflow === "FRAME_TO_VIDEO" ||
        value.workflow === "FIRST_LAST_FRAME") &&
      (referenceCount > 0 || count("SOURCE_VIDEO") > 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["sources"],
        message: "Frame workflows cannot be combined with reference media.",
      });
    }

    if (
      value.workflow === "REFERENCE" &&
      (frameCount > 0 || referenceCount < 1)
    ) {
      context.addIssue({
        code: "custom",
        path: ["sources"],
        message:
          "Reference workflow requires reference media and no frame roles.",
      });
    }

    const avatarCount = count("AVATAR_IMAGE");
    const drivingAudioCount = count("DRIVING_AUDIO");
    if (value.workflow === "TALKING_AVATAR") {
      if (
        avatarCount !== 1 ||
        drivingAudioCount !== 1 ||
        value.sources.length !== 2
      ) {
        context.addIssue({
          code: "custom",
          path: ["sources"],
          message:
            "Talking-avatar generation requires exactly one avatar image and one driving audio source.",
        });
      }
      if (value.aspectRatio !== "adaptive") {
        context.addIssue({
          code: "custom",
          path: ["aspectRatio"],
          message:
            "Talking-avatar generation uses the source image aspect ratio.",
        });
      }
      if (value.durationSeconds !== -1) {
        context.addIssue({
          code: "custom",
          path: ["durationSeconds"],
          message:
            "Talking-avatar duration is derived from the trusted driving audio.",
        });
      }
      if (value.generateAudio) {
        context.addIssue({
          code: "custom",
          path: ["generateAudio"],
          message:
            "Talking-avatar audio is supplied by the driving audio source.",
        });
      }
      if (value.outputFormat !== "mp4" || value.returnLastFrame) {
        context.addIssue({
          code: "custom",
          path: ["outputFormat"],
          message: "Talking-avatar generation supports MP4 output only.",
        });
      }
    } else if (avatarCount > 0 || drivingAudioCount > 0) {
      context.addIssue({
        code: "custom",
        path: ["sources"],
        message:
          "Avatar-image and driving-audio roles are only valid for the talking-avatar workflow.",
      });
    }

    if (value.workflow === "EDIT" || value.workflow === "EXTEND") {
      if (
        count("SOURCE_VIDEO") !== 1 ||
        frameCount > 0 ||
        referenceCount > 0 ||
        value.aspectRatio !== "adaptive"
      ) {
        context.addIssue({
          code: "custom",
          path: ["sources"],
          message:
            "Edit and extend require one source video, no other sources, and adaptive aspect ratio.",
        });
      }
      if (value.workflow === "EDIT" && value.durationSeconds !== -1) {
        context.addIssue({
          code: "custom",
          path: ["durationSeconds"],
          message: "Video editing must preserve the source duration.",
        });
      }
    }

    if (
      value.workflow === "GENERATE" &&
      (value.sources.length > 0 || value.sourceDraftJobId)
    ) {
      context.addIssue({
        code: "custom",
        path: ["sources"],
        message: "Text generation does not accept source assets.",
      });
    }

    if (value.workflow === "DRAFT_FINAL") {
      if (!value.sourceDraftJobId || value.sources.length > 0) {
        context.addIssue({
          code: "custom",
          path: ["sourceDraftJobId"],
          message:
            "Final rendering requires one Creators Draft job and no sources.",
        });
      }
      if (value.resolution !== "1080p") {
        context.addIssue({
          code: "custom",
          path: ["resolution"],
          message: "Seedance 2.5 Draft final rendering supports 1080p only.",
        });
      }
    } else if (value.sourceDraftJobId) {
      context.addIssue({
        code: "custom",
        path: ["sourceDraftJobId"],
        message: "A Draft source job is only valid for final rendering.",
      });
    }

    if (value.workflow === "DRAFT" && value.resolution !== "480p") {
      context.addIssue({
        code: "custom",
        path: ["resolution"],
        message: "Seedance 2.5 Draft generation supports 480p only.",
      });
    }

    if (
      value.durationSeconds !== -1 &&
      (value.durationSeconds < 4 || value.durationSeconds > 30)
    ) {
      context.addIssue({
        code: "custom",
        path: ["durationSeconds"],
        message: "Video duration must be between 4 and 30 seconds.",
      });
    }
  });

export type VideoRequestV2 = z.infer<typeof videoRequestV2Schema>;

export const legacyVideoRequestSchema = z
  .object({
    organizationId: z.string().min(1).max(100),
    projectId: z.string().min(1).max(100).nullable().optional(),
    modelId: z.string().min(1).max(100),
    priceVersionId: z.string().min(1).max(100),
    quoteToken: z.string().min(1).max(2048).optional(),
    idempotencyKey: z.uuid(),
    templateId: z.string().min(1).max(100).optional(),
    prompt: z.string().trim().min(1).max(2000),
    aspectRatio: aspectRatioSchema,
    resolution: z.enum(["720p", "1080p"]).default("1080p"),
    durationSeconds: z.number().int().min(1).max(30),
    generateAudio: z.boolean().default(false),
    firstFrameAssetId: z.string().min(1).max(100).optional(),
    lastFrameAssetId: z.string().min(1).max(100).optional(),
    referenceVideoAssetId: z.string().min(1).max(100).optional(),
  })
  .strict()
  .refine((value) => !value.lastFrameAssetId || value.firstFrameAssetId, {
    path: ["lastFrameAssetId"],
    message: "Choose a first frame before a last frame.",
  })
  .refine(
    (value) =>
      !value.referenceVideoAssetId ||
      (!value.firstFrameAssetId && !value.lastFrameAssetId),
    {
      path: ["referenceVideoAssetId"],
      message: "Choose reference video or image frames.",
    },
  )
  .refine(
    (value) => !value.firstFrameAssetId || value.aspectRatio === "adaptive",
    {
      path: ["aspectRatio"],
      message: "Image-to-video uses the source image ratio.",
    },
  );

export type LegacyVideoRequest = z.infer<typeof legacyVideoRequestSchema>;

export const videoRequestSchema = z.union([
  videoRequestV2Schema,
  legacyVideoRequestSchema,
]);

export function normalizeVideoRequest(
  value: z.infer<typeof videoRequestSchema>,
): VideoRequestV2 {
  const current = videoRequestV2Schema.safeParse(value);
  if (current.success) {
    return {
      ...current.data,
      sources: [...current.data.sources].sort(
        (a, b) => a.position - b.position,
      ),
    };
  }

  const legacy = legacyVideoRequestSchema.parse(value);
  const sources: VideoSource[] = [];
  if (legacy.firstFrameAssetId) {
    sources.push({
      assetId: legacy.firstFrameAssetId,
      role: "FIRST_FRAME",
      position: sources.length,
    });
  }
  if (legacy.lastFrameAssetId) {
    sources.push({
      assetId: legacy.lastFrameAssetId,
      role: "LAST_FRAME",
      position: sources.length,
    });
  }
  if (legacy.referenceVideoAssetId) {
    sources.push({
      assetId: legacy.referenceVideoAssetId,
      role: "REFERENCE_VIDEO",
      position: sources.length,
    });
  }
  const workflow: VideoWorkflow = legacy.referenceVideoAssetId
    ? "REFERENCE"
    : legacy.lastFrameAssetId
      ? "FIRST_LAST_FRAME"
      : legacy.firstFrameAssetId
        ? "FRAME_TO_VIDEO"
        : "GENERATE";

  return {
    schemaVersion: 2,
    organizationId: legacy.organizationId,
    projectId: legacy.projectId,
    modelId: legacy.modelId,
    priceVersionId: legacy.priceVersionId,
    quoteToken: legacy.quoteToken,
    idempotencyKey: legacy.idempotencyKey,
    templateId: legacy.templateId,
    workflow,
    prompt: legacy.prompt,
    sources,
    aspectRatio: legacy.aspectRatio,
    resolution: legacy.resolution,
    durationSeconds: legacy.durationSeconds,
    generateAudio: legacy.generateAudio,
    outputFormat: "mp4",
    returnLastFrame: true,
  };
}

function capabilityNumber(
  capabilities: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = capabilities[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function validateVideoModelRequest(
  providerModelId: string,
  rawCapabilities: unknown,
  request: VideoRequestV2,
): string | null {
  const capabilities =
    rawCapabilities &&
    typeof rawCapabilities === "object" &&
    !Array.isArray(rawCapabilities)
      ? (rawCapabilities as Record<string, unknown>)
      : {};

  if (capabilities[`resolution:${request.resolution}`] !== true) {
    return "Resolution is not supported by this model.";
  }
  if (capabilities[`aspectRatio:${request.aspectRatio}`] !== true) {
    return "Aspect ratio is not supported by this model.";
  }

  if (request.durationSeconds !== -1) {
    const minimum = capabilityNumber(capabilities, "minimumDurationSeconds", 4);
    const maximum = capabilityNumber(
      capabilities,
      "maximumDurationSeconds",
      30,
    );
    if (
      request.durationSeconds < minimum ||
      request.durationSeconds > maximum
    ) {
      return `Duration must be between ${minimum} and ${maximum} seconds for this model.`;
    }
  }

  if (request.generateAudio && capabilities.generateAudio !== true) {
    return "Synchronized audio is not supported by this model.";
  }
  if (request.outputFormat === "mov" && capabilities.outputFormatMov !== true) {
    return "MOV output is not supported by this model.";
  }
  if (request.returnLastFrame && capabilities.returnLastFrame !== true) {
    return "Returning the final frame is not supported by this model.";
  }
  if (
    request.workflow === "TALKING_AVATAR" &&
    capabilities.talkingAvatar !== true
  ) {
    return "Talking-avatar generation is not supported by this model.";
  }
  if (
    providerModelId === "omnihuman-1.5" &&
    request.workflow !== "TALKING_AVATAR"
  ) {
    return "OmniHuman 1.5 requires the talking-avatar workflow.";
  }
  if (request.workflow === "EDIT" && capabilities.editVideo !== true) {
    return "Video editing is not supported by this model.";
  }
  if (request.workflow === "EXTEND" && capabilities.extendVideo !== true) {
    return "Video extension is not supported by this model.";
  }
  if (
    (request.workflow === "DRAFT" || request.workflow === "DRAFT_FINAL") &&
    capabilities.draftMode !== true
  ) {
    return "Draft mode is not supported by this model.";
  }

  const counts = request.sources.reduce(
    (result, source) => {
      if (source.role === "REFERENCE_IMAGE") result.images += 1;
      if (source.role === "REFERENCE_VIDEO") result.videos += 1;
      if (source.role === "REFERENCE_AUDIO") result.audio += 1;
      return result;
    },
    { images: 0, videos: 0, audio: 0 },
  );

  if (
    counts.images > capabilityNumber(capabilities, "maxReferenceImages", 0) ||
    counts.videos > capabilityNumber(capabilities, "maxReferenceVideos", 0) ||
    counts.audio > capabilityNumber(capabilities, "maxReferenceAudio", 0)
  ) {
    return "Reference media count is outside the selected model limits.";
  }

  if (
    counts.audio > 0 &&
    counts.images === 0 &&
    counts.videos === 0 &&
    capabilities.audioOnlyReference !== true
  ) {
    return "This model requires an image or video when audio references are used.";
  }

  if (
    request.workflow === "DRAFT_FINAL" &&
    providerModelId !== "dreamina-seedance-2-5-260628"
  ) {
    return "Draft final rendering requires Seedance 2.5.";
  }
  return null;
}

export function hasVideoInput(request: VideoRequestV2): boolean {
  return request.sources.some(
    (source) =>
      source.role === "REFERENCE_VIDEO" || source.role === "SOURCE_VIDEO",
  );
}
