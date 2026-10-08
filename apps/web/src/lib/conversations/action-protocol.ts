import { z } from "zod";

export const ACTION_PROTOCOL_VERSION = "2026-10-05.v1";

export const aspectRatioSchema = z.enum([
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "21:9",
]);

export const resolutionSchema = z.enum([
  "1K",
  "1.5K",
  "2K",
  "3K",
  "4K",
  "720p",
  "1080p",
]);

export const assetTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("output_index"),
    index: z.number().int().min(1).max(100),
  }),
  z.object({
    kind: z.literal("asset_id"),
    assetId: z.string().min(1).max(100),
  }),
  z.object({
    kind: z.literal("selected_asset"),
  }),
]);

export const selectAssetActionSchema = z.object({
  type: z.literal("select_asset"),
  target: assetTargetSchema,
});

export const generateImageActionSchema = z.object({
  type: z.literal("generate_image"),
  prompt: z.string().trim().min(1).max(4000).optional(),
  aspectRatio: aspectRatioSchema.optional(),
  resolution: resolutionSchema.optional(),
  outputCount: z.number().int().min(1).max(15).optional(),
  referenceAssetIds: z.array(z.string().min(1)).max(14).optional(),
  modelId: z.string().min(1).max(100).optional(),
});

export const editImageActionSchema = z.object({
  type: z.literal("edit_image"),
  prompt: z.string().trim().min(1).max(4000).optional(),
  sourceAssetId: z.string().min(1).max(100).optional(),
  aspectRatio: aspectRatioSchema.optional(),
});

export const createVariationsActionSchema = z.object({
  type: z.literal("create_variations"),
  sourceAssetId: z.string().min(1).max(100).optional(),
  outputCount: z.number().int().min(1).max(15).optional(),
  prompt: z.string().trim().min(1).max(4000).optional(),
});

export const changeAspectRatioActionSchema = z.object({
  type: z.literal("change_aspect_ratio"),
  aspectRatio: aspectRatioSchema,
});

export const changeResolutionActionSchema = z.object({
  type: z.literal("change_resolution"),
  resolution: resolutionSchema,
});

export const switchModelActionSchema = z.object({
  type: z.literal("switch_model"),
  excludeCurrentModel: z.boolean().optional(),
  preferredModelId: z.string().min(1).max(100).optional(),
  targetMediaKind: z.enum(["IMAGE", "VIDEO", "VOICE"]).optional(),
});

export const generateVideoActionSchema = z.object({
  type: z.literal("generate_video"),
  prompt: z.string().trim().min(1).max(4000).optional(),
  firstFrameAssetId: z.string().min(1).max(100).optional(),
  lastFrameAssetId: z.string().min(1).max(100).optional(),
  durationSeconds: z.number().int().min(1).max(30).optional(),
  outputFormat: z.enum(["mp4", "mov"]).optional(),
  workflow: z
    .enum(["GENERATE", "FRAME_TO_VIDEO", "FIRST_LAST_FRAME", "EXTEND"])
    .optional(),
});

export const useFirstFrameActionSchema = z.object({
  type: z.literal("use_first_frame"),
  target: assetTargetSchema.optional(),
  assetId: z.string().min(1).max(100).optional(),
});

export const useLastFrameActionSchema = z.object({
  type: z.literal("use_last_frame"),
  target: assetTargetSchema.optional(),
  assetId: z.string().min(1).max(100).optional(),
});

export const extendVideoActionSchema = z.object({
  type: z.literal("extend_video"),
  sourceAssetId: z.string().min(1).max(100).optional(),
  direction: z.enum(["BEFORE", "AFTER"]).optional(),
  durationSeconds: z.number().int().min(1).max(30).optional(),
});

export const generateSpeechActionSchema = z.object({
  type: z.literal("generate_speech"),
  text: z.string().trim().min(1).max(4096).optional(),
  voiceKey: z.string().trim().min(1).max(100).optional(),
  speechRate: z.number().min(0.5).max(2.0).optional(),
});

export const changeVoiceActionSchema = z.object({
  type: z.literal("change_voice"),
  voiceKey: z.string().trim().min(1).max(100),
});

export const changeSpeakingRateActionSchema = z.object({
  type: z.literal("change_speaking_rate"),
  speechRate: z.number().min(0.5).max(2.0),
});

export const retryGenerationActionSchema = z.object({
  type: z.literal("retry_generation"),
  targetGenerationId: z.string().min(1).max(100).optional(),
});

export const enhancePromptActionSchema = z.object({
  type: z.literal("enhance_prompt"),
  prompt: z.string().trim().min(1).max(4000).optional(),
});

// Workbench handoffs cannot dispatch paid generation jobs.
export const openToolActionSchema = z.object({
  type: z.literal("open_tool"),
  toolId: z.enum([
    "transcription",
    "audio-generation",
    "spokesperson",
    "voice-casting",
    "video-editor",
    "precision-image",
    "scriptwriter",
    "creative-director",
    "brand-story",
    "character-chat",
  ]),
});

// Read-only answers never dispatch a billable generation job.
export const answerQuestionActionSchema = z.object({
  type: z.literal("answer_question"),
  question: z.string().trim().min(1).max(4000),
});

export const clarifyActionSchema = z.object({
  type: z.literal("clarify"),
  question: z.string().min(1).max(500),
  options: z
    .array(
      z.object({
        label: z.string().min(1).max(100),
        value: z.string().min(1).max(200),
        assetId: z.string().optional(),
        description: z.string().optional(),
      }),
    )
    .default([]),
});

export const conversationActionSchema = z.discriminatedUnion("type", [
  selectAssetActionSchema,
  generateImageActionSchema,
  editImageActionSchema,
  createVariationsActionSchema,
  changeAspectRatioActionSchema,
  changeResolutionActionSchema,
  switchModelActionSchema,
  generateVideoActionSchema,
  useFirstFrameActionSchema,
  useLastFrameActionSchema,
  extendVideoActionSchema,
  generateSpeechActionSchema,
  changeVoiceActionSchema,
  changeSpeakingRateActionSchema,
  retryGenerationActionSchema,
  enhancePromptActionSchema,
  answerQuestionActionSchema,
  openToolActionSchema,
  clarifyActionSchema,
]);

export type ConversationAction = z.infer<typeof conversationActionSchema>;

export const turnPlanSchema = z.object({
  version: z.string().default(ACTION_PROTOCOL_VERSION),
  actions: z.array(conversationActionSchema).min(1).max(10),
  reasoning: z.string().optional(),
});

export type TurnPlan = z.infer<typeof turnPlanSchema>;
