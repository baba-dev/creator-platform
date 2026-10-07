import { createHash } from "node:crypto";

import { createLogger } from "@aiwa/observability";
import { z } from "zod";

import {
  ProviderConfigurationError,
  ProviderRequestError,
  type MediaGenerationProvider,
  type MediaKind,
  type MediaSubmission,
  type ProviderJob,
  type ProviderJobStatus,
  type ProviderModelDescriptor,
} from "../index";
import {
  cancelAbandonedBody,
  executeSafeFetch,
  sharedReadResponseText,
} from "../http";
import {
  cancelOmniHumanVisionJob,
  getOmniHumanVisionJob,
  isOmniHumanVisionRequestId,
  submitOmniHumanVisionTask,
} from "./vision";

const MODELARK_BASE_URLS = {
  "ap-southeast-1": "https://ark.ap-southeast.bytepluses.com/api/v3",
  "eu-west-1": "https://ark.eu-west.bytepluses.com/api/v3",
} as const;

const DEFAULT_SPEECH_BASE_URL =
  "https://voice.ap-southeast-1.bytepluses.com/api/v3";
const DEFAULT_TIMEOUT_MS = 180_000;
const MAX_ERROR_BODY_BYTES = 32 * 1024;
const MAX_JSON_RESPONSE_BYTES = 1024 * 1024;
const MAX_SPEECH_RESPONSE_BYTES = 36 * 1024 * 1024;
const MAX_SPEECH_AUDIO_BYTES = 25 * 1024 * 1024;
const SPEECH_RESOURCE_ID = "seed-tts-2.0";
const SEED_AUDIO_MODEL_ID = "seed-audio-1.0";
const DEFAULT_SPEECH_APP_KEY = "aGjiRDfUWi";

export interface BytePlusAdapterConfig {
  readonly apiKey?: string;
  readonly region: keyof typeof MODELARK_BASE_URLS;
  readonly modelArkBaseUrl?: string;
  readonly visionAccessKeyId?: string;
  readonly visionSecretAccessKey?: string;
  readonly visionBaseUrl?: string;
  readonly speechApiKey?: string;
  readonly speechAppKey?: string;
  readonly speechBaseUrl?: string;
  readonly requestTimeoutMs?: number;
  readonly idleTimeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
}

export function isBytePlusMediaConfigured(
  config: {
    apiKey?: string;
    BYTEPLUS_API_KEY?: string;
    [key: string]: unknown;
  } = process.env,
): boolean {
  const key = (config.apiKey ?? config.BYTEPLUS_API_KEY) as string | undefined;
  return Boolean(key && key.trim().length > 0);
}

export function isBytePlusVisionConfigured(
  config: {
    visionAccessKeyId?: string;
    visionSecretAccessKey?: string;
    BYTEPLUS_VISION_ACCESS_KEY_ID?: string;
    BYTEPLUS_VISION_SECRET_ACCESS_KEY?: string;
    [key: string]: unknown;
  } = process.env,
): boolean {
  const accessKeyId = (config.visionAccessKeyId ??
    config.BYTEPLUS_VISION_ACCESS_KEY_ID) as string | undefined;
  const secretAccessKey = (config.visionSecretAccessKey ??
    config.BYTEPLUS_VISION_SECRET_ACCESS_KEY) as string | undefined;
  return Boolean(accessKeyId?.trim().length && secretAccessKey?.trim().length);
}

export function isBytePlusVoiceConfigured(
  config: {
    speechApiKey?: string;
    BYTEPLUS_SPEECH_API_KEY?: string;
    [key: string]: unknown;
  } = process.env,
): boolean {
  const speechApiKey = (config.speechApiKey ??
    config.BYTEPLUS_SPEECH_API_KEY) as string | undefined;
  return Boolean(speechApiKey && speechApiKey.trim().length > 0);
}

const httpsUrlSchema = z
  .url()
  .refine(
    (value) => new URL(value).protocol === "https:",
    "HTTPS URL required",
  );

const adapterConfigSchema = z.object({
  apiKey: z.string().trim().min(1).optional(),
  region: z.enum(["ap-southeast-1", "eu-west-1"]),
  modelArkBaseUrl: httpsUrlSchema.optional(),
  visionAccessKeyId: z.string().trim().min(1).optional(),
  visionSecretAccessKey: z.string().trim().min(1).optional(),
  visionBaseUrl: httpsUrlSchema.optional(),
  speechApiKey: z.string().trim().min(1).optional(),
  speechAppKey: z.string().trim().min(1).optional(),
  speechBaseUrl: httpsUrlSchema.optional(),
  requestTimeoutMs: z.number().int().positive().max(600_000).optional(),
  idleTimeoutMs: z.number().int().positive().max(600_000).optional(),
});

const providerIdentifierSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/);
const providerErrorCodeSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_.:-]+$/);

const imageAspectRatioSchema = z.enum([
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "21:9",
]);

export const bytePlusImageInputSchema = z
  .object({
    prompt: z.string().trim().min(1),
    aspectRatio: imageAspectRatioSchema.default("1:1"),
    resolution: z.enum(["1K", "1.5K", "2K", "3K", "4K"]).default("2K"),
    outputFormat: z.enum(["jpeg", "png"]).default("png"),
    watermark: z.boolean().default(false),
    outputCount: z.number().int().min(1).max(15).default(1),
    referenceImages: z
      .array(
        z
          .string()
          .startsWith("data:image/")
          .max(42 * 1024 * 1024),
      )
      .max(14)
      .default([]),
  })
  .superRefine((input, ctx) => {
    if (input.referenceImages.length + input.outputCount > 15) {
      ctx.addIssue({
        code: "custom",
        path: ["outputCount"],
        message:
          "Reference image count plus generated image count must not exceed 15.",
      });
    }
  });

const bytePlusVideoSourceSchema = z
  .object({
    role: z.enum([
      "FIRST_FRAME",
      "LAST_FRAME",
      "REFERENCE_IMAGE",
      "REFERENCE_VIDEO",
      "REFERENCE_AUDIO",
      "SOURCE_VIDEO",
      "AVATAR_IMAGE",
      "DRIVING_AUDIO",
    ]),
    url: httpsUrlSchema,
  })
  .strict();

export const bytePlusVideoInputSchema = z
  .object({
    workflow: z
      .enum([
        "GENERATE",
        "FRAME_TO_VIDEO",
        "FIRST_LAST_FRAME",
        "REFERENCE",
        "EDIT",
        "EXTEND",
        "DRAFT",
        "DRAFT_FINAL",
        "TALKING_AVATAR",
      ])
      .default("GENERATE"),
    prompt: z.string().trim().max(4000).default(""),
    sources: z.array(bytePlusVideoSourceSchema).max(50).default([]),
    aspectRatio: z
      .enum(["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"])
      .default("16:9"),
    resolution: z.enum(["480p", "720p", "1080p", "4K"]).default("720p"),
    durationSeconds: z.number().int().min(-1).max(30).default(5),
    generateAudio: z.boolean().default(false),
    watermark: z.boolean().default(false),
    outputFormat: z.enum(["mp4", "mov"]).default("mp4"),
    returnLastFrame: z.boolean().default(true),
    seed: z.number().int().min(-1).max(2_147_483_647).optional(),
    draftProviderTaskId: providerIdentifierSchema.optional(),
    extensionDirection: z.enum(["BEFORE", "AFTER"]).optional(),

    // V1 compatibility. The worker converts historical jobs to sources before
    // submission, but keeping these inputs accepted protects direct adapter
    // callers and old provider tests during the transition.
    firstFrameImage: z
      .string()
      .startsWith("data:image/")
      .max(42 * 1024 * 1024)
      .optional(),
    lastFrameImage: z
      .string()
      .startsWith("data:image/")
      .max(42 * 1024 * 1024)
      .optional(),
    referenceVideoUrl: httpsUrlSchema.optional(),
  })
  .superRefine((input, ctx) => {
    if (input.workflow === "DRAFT_FINAL" && !input.draftProviderTaskId) {
      ctx.addIssue({
        code: "custom",
        path: ["draftProviderTaskId"],
        message: "Draft final rendering requires a provider Draft task.",
      });
    }
    if (
      input.workflow !== "DRAFT_FINAL" &&
      input.workflow !== "TALKING_AVATAR" &&
      input.prompt.length === 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["prompt"],
        message: "A video prompt is required.",
      });
    }
    if (input.workflow === "EDIT") {
      if (input.aspectRatio !== "adaptive" || input.durationSeconds !== -1) {
        ctx.addIssue({
          code: "custom",
          path: ["durationSeconds"],
          message: "Editing requires adaptive ratio and duration -1.",
        });
      }
    }
    if (input.lastFrameImage && !input.firstFrameImage) {
      ctx.addIssue({
        code: "custom",
        path: ["lastFrameImage"],
        message: "A legacy last frame requires a first frame.",
      });
    }
    if (
      input.referenceVideoUrl &&
      (input.firstFrameImage || input.lastFrameImage)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["referenceVideoUrl"],
        message: "Legacy reference video cannot be combined with frame inputs.",
      });
    }
    if (
      input.sources.length > 0 &&
      (input.firstFrameImage || input.lastFrameImage || input.referenceVideoUrl)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["sources"],
        message: "V2 sources cannot be combined with legacy source fields.",
      });
    }
  });

export const bytePlusVoiceInputSchema = z
  .object({
    text: z.string().trim().min(1),
    speaker: z.string().trim().min(1),
    format: z.enum(["mp3", "ogg_opus", "pcm"]).default("mp3"),
    sampleRate: z
      .union([z.literal(8_000), z.literal(16_000), z.literal(24_000)])
      .default(24_000),
    // BytePlus recommends explicitly setting MP3/OGG bitrate. Production
    // defaults to 128 kbps; provider-default is for controlled A/B diagnostics.
    bitRate: z.number().int().min(64_000).max(320_000).default(128_000),
    qualityProfile: z
      .enum(["production", "provider-default"])
      .default("production"),
    // Application-facing multipliers. BytePlus receives integer percentages.
    speechRate: z.number().min(0.5).max(2).default(1),
    loudnessRate: z.number().min(0.5).max(2).default(1),
    pitch: z.number().int().min(-12).max(12).default(0),
    stylePrompt: z.string().trim().min(1).max(300).optional(),
  })
  .superRefine((input, ctx) => {
    if (
      input.qualityProfile === "provider-default" &&
      (input.stylePrompt ||
        input.loudnessRate !== 1 ||
        input.pitch !== 0 ||
        input.bitRate !== 128_000)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["qualityProfile"],
        message:
          "provider-default is reserved for legacy A/B diagnostics without expression overrides.",
      });
    }
  });

export const bytePlusSeedAudioInputSchema = z
  .object({
    task: z.literal("seed-audio"),
    textPrompt: z.string().trim().min(1).max(3000),
    referenceAudioUrls: z.array(httpsUrlSchema).max(3).default([]),
    referenceSpeakerIds: z
      .array(z.string().trim().min(1).max(200))
      .max(3)
      .default([]),
    referenceImageUrl: httpsUrlSchema.optional(),
    format: z.enum(["wav", "mp3", "pcm", "ogg_opus"]).default("mp3"),
    sampleRate: z
      .union([
        z.literal(8_000),
        z.literal(16_000),
        z.literal(24_000),
        z.literal(32_000),
        z.literal(44_100),
        z.literal(48_000),
      ])
      .default(44_100),
    speechRate: z.number().min(0.5).max(2).default(1),
    loudnessRate: z.number().min(0.5).max(2).default(1),
    pitch: z.number().int().min(-12).max(12).default(0),
    enableSubtitles: z.boolean().default(false),
    watermark: z.boolean().default(false),
  })
  .strict()
  .superRefine((input, ctx) => {
    const audioReferenceCount =
      input.referenceAudioUrls.length + input.referenceSpeakerIds.length;
    if (input.referenceImageUrl && audioReferenceCount > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["referenceImageUrl"],
        message: "Image and audio/speaker references cannot be combined.",
      });
    }
    if (audioReferenceCount > 3) {
      ctx.addIssue({
        code: "custom",
        path: ["referenceSpeakerIds"],
        message: "Seed Audio supports at most three audio references.",
      });
    }
  });

export function speechRateMultiplierToPercentage(multiplier: number): number {
  const parsed = z.number().min(0.5).max(2).safeParse(multiplier);
  if (!parsed.success) {
    throw new RangeError("speechRate multiplier must be between 0.5 and 2");
  }
  return Math.round((parsed.data - 1) * 100);
}

export const bytePlusChatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1),
});

export const bytePlusTextInputSchema = z.object({
  messages: z.array(bytePlusChatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().positive().max(8192).default(2048),
  topP: z.number().min(0).max(1).optional(),
  responseFormat: z.enum(["text", "json_object"]).default("text"),
});

export const VERIFIED_BYTEPLUS_MODELS: readonly ProviderModelDescriptor[] = [
  {
    id: "seedream-5-0-260128",
    provider: "byteplus",
    displayName: "Seedream 5.0 Lite",
    description:
      "Prompt-aware image creation with strong consistency and editing control.",
    mediaKind: "image",
    capabilities: {
      "aspectRatio:1:1": true,
      "aspectRatio:4:3": true,
      "aspectRatio:3:4": true,
      "aspectRatio:16:9": true,
      "aspectRatio:9:16": true,
      "aspectRatio:3:2": true,
      "aspectRatio:2:3": true,
      "aspectRatio:21:9": true,
      "resolution:2K": true,
      "resolution:3K": true,
      "resolution:4K": true,
      referenceImages: true,
      sequentialImages: true,
      maxGeneratedImages: 15,
      maxTotalInputOutputImages: 15,
      maxReferenceImages: 14,
    },
  },
  {
    id: "dola-seedream-5-0-pro-260628",
    provider: "byteplus",
    displayName: "Seedream 5.0 Pro",
    description:
      "High-quality image generation and coordinate-guided precision editing.",
    mediaKind: "image",
    capabilities: {
      "aspectRatio:1:1": true,
      "aspectRatio:4:3": true,
      "aspectRatio:3:4": true,
      "aspectRatio:16:9": true,
      "aspectRatio:9:16": true,
      "aspectRatio:3:2": true,
      "aspectRatio:2:3": true,
      "aspectRatio:21:9": true,
      "resolution:1K": true,
      "resolution:1.5K": true,
      "resolution:2K": true,
      referenceImages: true,
      maxReferenceImages: 10,
      sequentialImages: false,
      maxGeneratedImages: 1,
      maxTotalInputOutputImages: 11,
      preciseEditing: true,
      inpainting: true,
      outpainting: true,
      objectReplacement: true,
    },
  },
  {
    id: "seedream-4-5-251128",
    provider: "byteplus",
    displayName: "Seedream 4.5",
    description:
      "Reliable campaign visuals, typography, and multi-reference composition.",
    mediaKind: "image",
    capabilities: {
      "aspectRatio:1:1": true,
      "aspectRatio:4:3": true,
      "aspectRatio:3:4": true,
      "aspectRatio:16:9": true,
      "aspectRatio:9:16": true,
      "aspectRatio:3:2": true,
      "aspectRatio:2:3": true,
      "aspectRatio:21:9": true,
      "resolution:2K": true,
      "resolution:4K": true,
      referenceImages: true,
      sequentialImages: true,
      maxGeneratedImages: 15,
      maxTotalInputOutputImages: 15,
      maxReferenceImages: 14,
    },
  },
  {
    id: "seedream-4-0-250828",
    provider: "byteplus",
    displayName: "Seedream 4.0",
    description:
      "Versatile foundation image generation with balanced styling and prompt fidelity.",
    mediaKind: "image",
    capabilities: {
      "aspectRatio:1:1": true,
      "aspectRatio:4:3": true,
      "aspectRatio:3:4": true,
      "aspectRatio:16:9": true,
      "aspectRatio:9:16": true,
      "aspectRatio:3:2": true,
      "aspectRatio:2:3": true,
      "aspectRatio:21:9": true,
      "resolution:1K": true,
      "resolution:2K": true,
      "resolution:4K": true,
      referenceImages: true,
      sequentialImages: true,
      maxGeneratedImages: 15,
      maxTotalInputOutputImages: 15,
      maxReferenceImages: 14,
    },
  },
  {
    id: "dreamina-seedance-2-0-mini-260615",
    provider: "byteplus",
    displayName: "Seedance 2.0 Mini",
    description:
      "Cost-efficient Seedance video generation for drafts, iteration, references, editing and extension.",
    mediaKind: "video",
    capabilities: {
      "aspectRatio:16:9": true,
      "aspectRatio:9:16": true,
      "aspectRatio:1:1": true,
      "aspectRatio:4:3": true,
      "aspectRatio:3:4": true,
      "aspectRatio:21:9": true,
      "aspectRatio:adaptive": true,
      "resolution:480p": true,
      "resolution:720p": true,
      generateAudio: true,
      firstFrame: true,
      lastFrame: true,
      referenceImages: true,
      referenceVideo: true,
      referenceAudio: true,
      maxReferenceImages: 9,
      maxReferenceVideos: 3,
      maxReferenceAudio: 3,
      maxReferenceVideoDurationSeconds: 15,
      maxReferenceAudioDurationSeconds: 15,
      audioOnlyReference: false,
      editVideo: true,
      extendVideo: true,
      draftMode: false,
      outputFormatMov: false,
      returnLastFrame: true,
      minimumDurationSeconds: 4,
      maximumDurationSeconds: 15,
      fps: 24,
      concurrencyLimit: 10,
    },
  },
  {
    id: "dreamina-seedance-2-0-fast-260128",
    provider: "byteplus",
    displayName: "Seedance 2.0 Fast",
    description:
      "Fast Seedance iteration with multimodal references, synchronized audio, editing and extension.",
    mediaKind: "video",
    capabilities: {
      "aspectRatio:16:9": true,
      "aspectRatio:9:16": true,
      "aspectRatio:1:1": true,
      "aspectRatio:4:3": true,
      "aspectRatio:3:4": true,
      "aspectRatio:21:9": true,
      "aspectRatio:adaptive": true,
      "resolution:480p": true,
      "resolution:720p": true,
      generateAudio: true,
      firstFrame: true,
      lastFrame: true,
      referenceImages: true,
      referenceVideo: true,
      referenceAudio: true,
      maxReferenceImages: 9,
      maxReferenceVideos: 3,
      maxReferenceAudio: 3,
      maxReferenceVideoDurationSeconds: 15,
      maxReferenceAudioDurationSeconds: 15,
      audioOnlyReference: false,
      editVideo: true,
      extendVideo: true,
      draftMode: false,
      outputFormatMov: false,
      returnLastFrame: true,
      minimumDurationSeconds: 4,
      maximumDurationSeconds: 15,
      fps: 24,
      concurrencyLimit: 10,
    },
  },
  {
    id: "dreamina-seedance-2-0-260128",
    provider: "byteplus",
    displayName: "Seedance 2.0",
    description:
      "Production Seedance video generation with 1080p/4K output, references, editing and extension.",
    mediaKind: "video",
    capabilities: {
      "aspectRatio:16:9": true,
      "aspectRatio:9:16": true,
      "aspectRatio:1:1": true,
      "aspectRatio:4:3": true,
      "aspectRatio:3:4": true,
      "aspectRatio:21:9": true,
      "aspectRatio:adaptive": true,
      "resolution:480p": true,
      "resolution:720p": true,
      "resolution:1080p": true,
      "resolution:4K": true,
      generateAudio: true,
      firstFrame: true,
      lastFrame: true,
      referenceImages: true,
      referenceVideo: true,
      referenceAudio: true,
      maxReferenceImages: 9,
      maxReferenceVideos: 3,
      maxReferenceAudio: 3,
      maxReferenceVideoDurationSeconds: 15,
      maxReferenceAudioDurationSeconds: 15,
      audioOnlyReference: false,
      editVideo: true,
      extendVideo: true,
      draftMode: false,
      outputFormatMov: false,
      returnLastFrame: true,
      minimumDurationSeconds: 4,
      maximumDurationSeconds: 15,
      fps: 24,
      concurrencyLimit: 10,
      concurrencyLimit4K: 1,
    },
  },
  {
    id: "dreamina-seedance-2-5-260628",
    provider: "byteplus",
    displayName: "Seedance 2.5",
    description:
      "Director-grade 30-second multimodal video generation, Draft review, editing and extension.",
    mediaKind: "video",
    capabilities: {
      "aspectRatio:16:9": true,
      "aspectRatio:9:16": true,
      "aspectRatio:1:1": true,
      "aspectRatio:4:3": true,
      "aspectRatio:3:4": true,
      "aspectRatio:21:9": true,
      "aspectRatio:adaptive": true,
      "resolution:480p": true,
      "resolution:720p": true,
      "resolution:1080p": true,
      generateAudio: true,
      firstFrame: true,
      lastFrame: true,
      referenceImages: true,
      referenceVideo: true,
      referenceAudio: true,
      maxReferenceImages: 30,
      maxReferenceVideos: 10,
      maxReferenceAudio: 10,
      maxReferenceVideoDurationSeconds: 30,
      maxReferenceAudioDurationSeconds: 30,
      audioOnlyReference: true,
      editVideo: true,
      extendVideo: true,
      draftMode: true,
      outputFormatMov: true,
      returnLastFrame: true,
      minimumDurationSeconds: 4,
      maximumDurationSeconds: 30,
      fps: 24,
      concurrencyLimit: 10,
    },
  },
  {
    id: "omnihuman-1.5",
    provider: "byteplus",
    displayName: "OmniHuman 1.5",
    description:
      "Expressive talking-avatar video from one portrait image and a driving audio track.",
    mediaKind: "video",
    capabilities: {
      "aspectRatio:adaptive": true,
      "resolution:720p": true,
      "resolution:1080p": true,
      talkingAvatar: true,
      avatarImage: true,
      audioInput: true,
      outputFormatMov: false,
      returnLastFrame: false,
      maximumDurationSeconds: 60,
      concurrencyLimit: 1,
      providerTransport: "vision",
    },
  },
  {
    id: SPEECH_RESOURCE_ID,
    provider: "byteplus",
    displayName: "Seed Speech TTS 2.0",
    description:
      "Expressive, context-aware narration returned as synthesized audio bytes.",
    mediaKind: "voice",
    capabilities: {
      streaming: true,
      speechRate: true,
      loudnessRate: true,
      pitch: true,
      contextPrompt: true,
      explicitBitRate: true,
      "format:mp3": true,
      "format:ogg_opus": true,
      "format:pcm": true,
    },
  },
  {
    id: SEED_AUDIO_MODEL_ID,
    provider: "byteplus",
    displayName: "Seed Audio 1.0",
    description:
      "Prompt-directed audio and advanced voiceover with audio or image references.",
    mediaKind: "voice",
    capabilities: {
      audioGeneration: true,
      promptDirected: true,
      referenceAudio: true,
      referenceSpeaker: true,
      maxReferenceAudio: 3,
      referenceImage: true,
      imageAudioExclusive: true,
      longFormVoiceover: true,
      maxOutputSeconds: 120,
      pricingUnit: "SECOND",
      subtitles: true,
      "format:mp3": true,
      "format:wav": true,
      "format:pcm": true,
      "format:ogg_opus": true,
      "sampleRate:8000": true,
      "sampleRate:16000": true,
      "sampleRate:24000": true,
      "sampleRate:32000": true,
      "sampleRate:44100": true,
      "sampleRate:48000": true,
    },
  },
  {
    id: "dola-seed-2-1-turbo-260628",
    provider: "byteplus",
    displayName: "Dola Seed 2.1 Turbo",
    description:
      "Flagship deep reasoning and agentic text generation with 256K context.",
    mediaKind: "text",
    capabilities: {
      contextWindow: 262144,
      maxTokens: 8192,
      streaming: true,
      chat: true,
      reasoning: true,
      toolCall: true,
    },
  },
  {
    id: "seed-2-0-pro-260328",
    provider: "byteplus",
    displayName: "Seed 2.0 Pro",
    description:
      "Frontier reasoning, long-chain planning, and complex story architecture.",
    mediaKind: "text",
    capabilities: {
      contextWindow: 262144,
      maxTokens: 8192,
      streaming: true,
      chat: true,
      reasoning: true,
      storyPlanning: true,
    },
  },
  {
    id: "seed-2-0-lite-260428",
    provider: "byteplus",
    displayName: "Seed 2.0 Lite",
    description:
      "High-efficiency balanced generation for scripts, articles, and dialogue.",
    mediaKind: "text",
    capabilities: {
      contextWindow: 262144,
      maxTokens: 8192,
      streaming: true,
      chat: true,
      scriptwriting: true,
    },
  },
  {
    id: "seed-2-0-mini-260428",
    provider: "byteplus",
    displayName: "Seed 2.0 Mini",
    description:
      "Low-latency responsive text generation for conversational assistance.",
    mediaKind: "text",
    capabilities: {
      contextWindow: 131072,
      maxTokens: 4096,
      streaming: true,
      chat: true,
      fast: true,
    },
  },
  {
    id: "seed-2-0-code-preview-260328",
    provider: "byteplus",
    displayName: "Seed 2.0 Code Preview",
    description:
      "Structured technical reasoning, prompt syntax, and code generation.",
    mediaKind: "text",
    capabilities: {
      contextWindow: 262144,
      maxTokens: 8192,
      streaming: true,
      chat: true,
      code: true,
    },
  },
  {
    id: "doubao-seed-character-260628",
    provider: "byteplus",
    displayName: "Seed Character",
    description:
      "Persona-faithful conversational roleplay and expressive character dialogue.",
    mediaKind: "text",
    capabilities: {
      contextWindow: 131072,
      maxTokens: 4096,
      streaming: true,
      chat: true,
      roleplay: true,
      characterChat: true,
    },
  },
  {
    id: "seed-1-8-251228",
    provider: "byteplus",
    displayName: "Seed 1.8",
    description:
      "Reliable foundation model for steady long-form narrative generation.",
    mediaKind: "text",
    capabilities: {
      contextWindow: 131072,
      maxTokens: 4096,
      streaming: true,
      chat: true,
    },
  },
  {
    id: "seed-1-6-250915",
    provider: "byteplus",
    displayName: "Seed 1.6",
    description:
      "Versatile foundation text model with consistent instruction following.",
    mediaKind: "text",
    capabilities: {
      contextWindow: 131072,
      maxTokens: 4096,
      streaming: true,
      chat: true,
    },
  },
  {
    id: "seed-1-6-flash-250715",
    provider: "byteplus",
    displayName: "Seed 1.6 Flash",
    description:
      "Ultra-fast lightweight completion engine for real-time interaction.",
    mediaKind: "text",
    capabilities: {
      contextWindow: 32768,
      maxTokens: 2048,
      streaming: true,
      chat: true,
      flash: true,
    },
  },
];

const textResponseSchema = z.object({
  id: providerIdentifierSchema.optional(),
  choices: z
    .array(
      z.object({
        message: z.object({
          role: z.string(),
          content: z.string().nullable().optional(),
        }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
      total_tokens: z.number().int().nonnegative().optional(),
      prompt_tokens_details: z
        .object({
          cached_tokens: z.number().int().nonnegative().optional(),
        })
        .optional(),
    })
    .optional(),
});

const imageResponseSchema = z.object({
  id: providerIdentifierSchema.optional(),
  data: z.array(z.object({ url: httpsUrlSchema })).min(1),
  usage: z.record(z.string(), z.unknown()).optional(),
});

const videoCreateResponseSchema = z.object({ id: providerIdentifierSchema });

const videoTaskResponseSchema = z.object({
  id: providerIdentifierSchema,
  status: z.string().min(1),
  content: z
    .object({
      video_url: httpsUrlSchema.optional(),
      last_frame_url: httpsUrlSchema.optional(),
    })
    .optional(),
  error: z
    .object({
      code: providerErrorCodeSchema.optional(),
    })
    .optional(),
  usage: z.record(z.string(), z.unknown()).optional(),
});

const speechChunkSchema = z.object({
  reqid: providerIdentifierSchema.optional(),
  code: z.coerce.number(),
  sequence: z.number().int().optional(),
  // BytePlus emits terminal NDJSON frames with `data: null`.
  data: z.base64().nullable().optional(),
});

const bytePlusErrorSchema = z.object({
  code: providerErrorCodeSchema.optional(),
  error: z.object({ code: providerErrorCodeSchema.optional() }).optional(),
  // Seed Speech errors use a header envelope with a numeric code.
  header: z
    .object({
      code: z.union([providerErrorCodeSchema, z.number().int()]).optional(),
    })
    .optional(),
});

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function mapAspectRatioToSize(
  aspectRatio: z.infer<typeof imageAspectRatioSchema>,
  resolution: "1K" | "1.5K" | "2K" | "3K" | "4K",
  modelId?: string,
): string {
  if (modelId === "dola-seedream-5-0-pro-260628") {
    const proSizes = {
      "1K": {
        "1:1": "1024x1024",
        "16:9": "1424x800",
        "9:16": "800x1424",
        "4:3": "1152x864",
        "3:4": "864x1152",
        "3:2": "1248x832",
        "2:3": "832x1248",
        "21:9": "1568x672",
      },
      "1.5K": {
        "1:1": "1536x1536",
        "16:9": "2048x1152",
        "9:16": "1152x2048",
        "4:3": "1792x1344",
        "3:4": "1344x1792",
        "3:2": "1872x1248",
        "2:3": "1248x1872",
        "21:9": "2352x1008",
      },
      "2K": {
        "1:1": "2048x2048",
        "16:9": "2816x1584",
        "9:16": "1584x2816",
        "4:3": "2368x1776",
        "3:4": "1776x2368",
        "3:2": "2496x1664",
        "2:3": "1664x2496",
        "21:9": "3136x1344",
      },
    } as const;
    if (resolution !== "1K" && resolution !== "1.5K" && resolution !== "2K") {
      throw new ProviderRequestError(
        "Resolution is not supported by Seedream 5.0 Pro",
        false,
        { code: "UNSUPPORTED_RESOLUTION" },
      );
    }
    return proSizes[resolution][aspectRatio];
  }

  if (resolution === "1.5K") {
    throw new ProviderRequestError(
      "1.5K output is only supported by Seedream 5.0 Pro",
      false,
      { code: "UNSUPPORTED_RESOLUTION" },
    );
  }

  const sizes = {
    "1K": {
      "1:1": "1024x1024",
      "16:9": "1312x736",
      "9:16": "736x1312",
      "4:3": "1152x864",
      "3:4": "864x1152",
      "3:2": "1248x832",
      "2:3": "832x1248",
      "21:9": "1568x672",
    },
    "2K": {
      "1:1": "2048x2048",
      "16:9": "2848x1600",
      "9:16": "1600x2848",
      "4:3": "2304x1728",
      "3:4": "1728x2304",
      "3:2": "2496x1664",
      "2:3": "1664x2496",
      "21:9": "3136x1344",
    },
    "3K": {
      "1:1": "3072x3072",
      "16:9": "4096x2304",
      "9:16": "2304x4096",
      "4:3": "3456x2592",
      "3:4": "2592x3456",
      "3:2": "3744x2496",
      "2:3": "2496x3744",
      "21:9": "4704x2016",
    },
    "4K": {
      "1:1": "4096x4096",
      "16:9": "5504x3040",
      "9:16": "3040x5504",
      "4:3": "4704x3520",
      "3:4": "3520x4704",
      "3:2": "4992x3328",
      "2:3": "3328x4992",
      "21:9": "6240x2656",
    },
  } as const;
  return sizes[resolution][aspectRatio];
}

function mapTaskStatus(status: string): ProviderJobStatus {
  switch (status.toLowerCase()) {
    case "queued":
    case "pending":
      return "submitted";
    case "running":
    case "processing":
      return "processing";
    case "succeeded":
    case "success":
      return "succeeded";
    case "failed":
    case "error":
    case "expired":
      return "failed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    default:
      throw new ProviderRequestError(
        "BytePlus returned an unknown task status",
        true,
        { code: "INVALID_PROVIDER_RESPONSE" },
      );
  }
}

function stableRequestId(prefix: string, idempotencyKey: string): string {
  const digest = createHash("sha256").update(idempotencyKey).digest("hex");
  return `${prefix}-${digest.slice(0, 24)}`;
}

function requestUuid(idempotencyKey: string): string {
  const digest = createHash("sha256").update(idempotencyKey).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

export function normalizeBytePlusModelId(modelId: string): string {
  if (modelId === "omnihuman" || modelId === "omnihuman-1-5") {
    return "omnihuman-1.5";
  }
  if (
    modelId === "seedream-5-0-pro" ||
    modelId === "seedream-5-0-pro-260628" ||
    modelId === "dola-seedream-5-0-pro-260628"
  ) {
    return "dola-seedream-5-0-pro-260628";
  }
  return modelId;
}

function assertModelSupportsMediaKind(
  modelId: string,
  mediaKind: MediaKind,
): void {
  const normalized = normalizeBytePlusModelId(modelId);
  const model = VERIFIED_BYTEPLUS_MODELS.find((item) => item.id === normalized);
  if (!model || model.mediaKind !== mediaKind) {
    throw new ProviderRequestError(
      "Unsupported BytePlus model for requested media kind",
      false,
      { code: "UNSUPPORTED_MODEL" },
    );
  }
}

function parseProviderRequestId(providerRequestId: string): string {
  const parsed = providerIdentifierSchema.safeParse(providerRequestId);
  if (!parsed.success) {
    throw new ProviderRequestError(
      "Invalid BytePlus provider request identifier",
      false,
      { code: "INVALID_INPUT" },
    );
  }
  return parsed.data;
}

export function mapBytePlusError(
  status: number,
  bodyText: string,
): ProviderRequestError {
  let code: string | undefined;
  try {
    const parsed = bytePlusErrorSchema.safeParse(JSON.parse(bodyText));
    if (parsed.success) {
      const rawCode =
        parsed.data.error?.code ?? parsed.data.code ?? parsed.data.header?.code;
      code = typeof rawCode === "number" ? `SPEECH_${rawCode}` : rawCode;
    }
  } catch {
    // Error bodies are intentionally not reflected in application errors.
  }

  const safeCode =
    code && /^[A-Za-z0-9_.:-]{1,100}$/.test(code) ? code : undefined;
  const retryable =
    status === 408 ||
    status === 429 ||
    (status >= 500 && status <= 599) ||
    (safeCode !== undefined &&
      /rate.?limit|throttl|resource.?exhausted/i.test(safeCode));
  const suffix = safeCode ? ` (${safeCode})` : "";
  return new ProviderRequestError(
    `BytePlus request failed with status ${status}${suffix}`,
    retryable,
    { code: safeCode ?? `HTTP_${status}` },
  );
}

export { cancelAbandonedBody } from "../http";

export async function safeFetch(
  fetchFn: typeof globalThis.fetch,
  url: string,
  options: RequestInit,
  timeoutMs: number,
  idleTimeoutMs?: number,
): Promise<Response> {
  return executeSafeFetch(fetchFn, url, options, {
    timeoutMs,
    idleTimeoutMs,
    defaultIdleTimeoutMs: 30_000,
    providerName: "BytePlus",
    onAbortCode: "REQUEST_TIMEOUT",
    onAbortRetryable: true,
    onNetworkErrorCode: "NETWORK_ERROR",
  });
}

export async function readResponseText(
  response: Response,
  maximumBytes: number,
): Promise<string> {
  return sharedReadResponseText(response, maximumBytes, {
    providerName: "BytePlus",
    onAbortCode: "REQUEST_TIMEOUT",
    onAbortRetryable: true,
    onNetworkErrorCode: "NETWORK_ERROR",
  });
}

async function assertSuccessfulResponse(response: Response): Promise<void> {
  if (response.ok) return;
  const body = await readResponseText(response, MAX_ERROR_BODY_BYTES).catch(
    (error: unknown) => {
      if (
        error instanceof ProviderRequestError &&
        error.code === "REQUEST_TIMEOUT"
      )
        throw error;
      return "";
    },
  );
  throw mapBytePlusError(response.status, body);
}

async function parseJsonResponse<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<T> {
  let value: unknown;
  try {
    value = JSON.parse(
      await readResponseText(response, MAX_JSON_RESPONSE_BYTES),
    );
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError("BytePlus returned invalid JSON", true, {
      cause: error,
      code: "INVALID_PROVIDER_RESPONSE",
    });
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ProviderRequestError(
      "BytePlus returned an invalid response shape",
      true,
      { code: "INVALID_PROVIDER_RESPONSE" },
    );
  }
  return parsed.data;
}

function parseSpeechChunks(body: string): z.infer<typeof speechChunkSchema>[] {
  const parseValue = (value: unknown) => {
    const parsed = speechChunkSchema.safeParse(value);
    if (!parsed.success) {
      throw new ProviderRequestError(
        "BytePlus returned an invalid speech response",
        true,
        { code: "INVALID_PROVIDER_RESPONSE" },
      );
    }
    return parsed.data;
  };

  try {
    const value: unknown = JSON.parse(body);
    return Array.isArray(value) ? value.map(parseValue) : [parseValue(value)];
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
  }

  const chunks: z.infer<typeof speechChunkSchema>[] = [];
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^data:\s*/, "");
    if (!line || line === "[DONE]") continue;
    try {
      chunks.push(parseValue(JSON.parse(line)));
    } catch (error) {
      if (error instanceof ProviderRequestError) throw error;
      throw new ProviderRequestError(
        "BytePlus returned an invalid speech stream",
        true,
        { cause: error, code: "INVALID_PROVIDER_RESPONSE" },
      );
    }
  }
  if (chunks.length === 0) {
    throw new ProviderRequestError(
      "BytePlus returned an empty speech stream",
      true,
      {
        code: "INVALID_PROVIDER_RESPONSE",
      },
    );
  }
  return chunks;
}

function decodeSpeechAudio(
  chunks: readonly z.infer<typeof speechChunkSchema>[],
): Buffer {
  const successfulCodes = new Set([0, 20_000_000]);
  const audioParts: Buffer[] = [];
  let totalBytes = 0;
  for (const chunk of chunks) {
    if (!successfulCodes.has(chunk.code)) {
      throw new ProviderRequestError(
        "BytePlus speech synthesis failed",
        false,
        {
          code: `SPEECH_${chunk.code}`,
        },
      );
    }
    if (!chunk.data) continue;
    const part = Buffer.from(chunk.data, "base64");
    totalBytes += part.byteLength;
    if (totalBytes > MAX_SPEECH_AUDIO_BYTES) {
      throw new ProviderRequestError(
        "BytePlus speech audio exceeded size limit",
        true,
        {
          code: "RESPONSE_TOO_LARGE",
        },
      );
    }
    audioParts.push(part);
  }
  if (audioParts.length === 0) {
    throw new ProviderRequestError("BytePlus returned no speech audio", true, {
      code: "INVALID_PROVIDER_RESPONSE",
    });
  }
  return Buffer.concat(audioParts);
}

function audioMediaType(format: "mp3" | "ogg_opus" | "pcm"): string {
  switch (format) {
    case "mp3":
      return "audio/mpeg";
    case "ogg_opus":
      return "audio/ogg; codecs=opus";
    case "pcm":
      return "audio/L16";
  }
}

export function createBytePlusProvider(
  config: BytePlusAdapterConfig,
): MediaGenerationProvider {
  const parsedConfig = adapterConfigSchema.safeParse(config);
  if (!parsedConfig.success) {
    throw new ProviderConfigurationError(
      "BytePlus adapter configuration is invalid",
    );
  }

  const validated = parsedConfig.data;
  const hasMediaConfig = Boolean(validated.apiKey);
  const hasVisionAccessKey = Boolean(validated.visionAccessKeyId);
  const hasVisionSecretKey = Boolean(validated.visionSecretAccessKey);
  if (hasVisionAccessKey !== hasVisionSecretKey) {
    throw new ProviderConfigurationError(
      "BytePlus Vision access key and secret key must be configured together",
    );
  }
  const hasVisionConfig = hasVisionAccessKey && hasVisionSecretKey;
  const hasSpeechConfig = Boolean(validated.speechApiKey);
  if (!hasMediaConfig && !hasVisionConfig && !hasSpeechConfig) {
    throw new ProviderConfigurationError(
      "BytePlus adapter configuration is invalid: no ModelArk, Vision, or Speech credentials are provided",
    );
  }

  const fetchClient = config.fetch ?? globalThis.fetch;
  if (!fetchClient) {
    throw new ProviderConfigurationError("A fetch implementation is required");
  }
  const baseUrl = trimTrailingSlashes(
    validated.modelArkBaseUrl ?? MODELARK_BASE_URLS[validated.region],
  );
  const speechBaseUrl = trimTrailingSlashes(
    validated.speechBaseUrl ?? DEFAULT_SPEECH_BASE_URL,
  );
  const timeoutMs = validated.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const idleTimeoutMs = validated.idleTimeoutMs;
  const logger = createLogger({
    service: "byteplus-adapter",
    version: "0.1.0",
  });
  const modelArkHeaders = {
    authorization: `Bearer ${validated.apiKey ?? ""}`,
    "content-type": "application/json",
  };

  return {
    name: "byteplus",

    async listModels(): Promise<readonly ProviderModelDescriptor[]> {
      return VERIFIED_BYTEPLUS_MODELS;
    },

    async submit(submission: MediaSubmission): Promise<ProviderJob> {
      const resolvedModelId = normalizeBytePlusModelId(submission.modelId);
      assertModelSupportsMediaKind(resolvedModelId, submission.mediaKind);
      logger.info("Submitting BytePlus media generation job", {
        modelId: resolvedModelId,
        mediaKind: submission.mediaKind,
      });

      switch (submission.mediaKind) {
        case "image": {
          if (!validated.apiKey) {
            throw new ProviderConfigurationError(
              "BytePlus ModelArk API key is required for image and video generation",
            );
          }
          const input = bytePlusImageInputSchema.safeParse(submission.input);
          if (!input.success) {
            throw new ProviderRequestError(
              "Invalid BytePlus image input",
              false,
              {
                code: "INVALID_INPUT",
              },
            );
          }
          const imageModel = VERIFIED_BYTEPLUS_MODELS.find(
            (model) =>
              model.id === resolvedModelId && model.mediaKind === "image",
          );
          if (
            imageModel?.capabilities[`resolution:${input.data.resolution}`] !==
            true
          ) {
            throw new ProviderRequestError(
              "Resolution is not supported by this BytePlus image model",
              false,
              { code: "UNSUPPORTED_RESOLUTION" },
            );
          }
          const capabilityRecord =
            imageModel?.capabilities &&
            typeof imageModel.capabilities === "object" &&
            !Array.isArray(imageModel.capabilities)
              ? (imageModel.capabilities as Record<string, unknown>)
              : {};
          const maxReferences =
            typeof capabilityRecord.maxReferenceImages === "number"
              ? capabilityRecord.maxReferenceImages
              : 0;
          const maxOutputs =
            typeof capabilityRecord.maxGeneratedImages === "number"
              ? capabilityRecord.maxGeneratedImages
              : 1;
          const maxTotalImages =
            typeof capabilityRecord.maxTotalInputOutputImages === "number"
              ? capabilityRecord.maxTotalInputOutputImages
              : maxOutputs;
          if (input.data.referenceImages.length > maxReferences) {
            throw new ProviderRequestError(
              `This BytePlus image model supports at most ${maxReferences} reference images`,
              false,
              { code: "TOO_MANY_REFERENCE_IMAGES" },
            );
          }
          if (input.data.outputCount > maxOutputs) {
            throw new ProviderRequestError(
              `This BytePlus image model supports at most ${maxOutputs} generated images`,
              false,
              { code: "TOO_MANY_OUTPUT_IMAGES" },
            );
          }
          if (
            input.data.referenceImages.length + input.data.outputCount >
            maxTotalImages
          ) {
            throw new ProviderRequestError(
              `Reference images plus generated images must not exceed ${maxTotalImages}`,
              false,
              { code: "TOO_MANY_IMAGES" },
            );
          }
          if (
            input.data.outputCount > 1 &&
            capabilityRecord.sequentialImages !== true
          ) {
            throw new ProviderRequestError(
              "Sequential image generation is not supported by this model",
              false,
              { code: "UNSUPPORTED_OUTPUT_COUNT" },
            );
          }
          const response = await safeFetch(
            fetchClient,
            `${baseUrl}/images/generations`,
            {
              method: "POST",
              headers: modelArkHeaders,
              body: JSON.stringify({
                model: resolvedModelId,
                prompt: input.data.prompt,
                size: mapAspectRatioToSize(
                  input.data.aspectRatio,
                  input.data.resolution,
                  resolvedModelId,
                ),
                ...(resolvedModelId === "seedream-5-0-260128" ||
                resolvedModelId === "dola-seedream-5-0-pro-260628"
                  ? { output_format: input.data.outputFormat }
                  : {}),
                ...(input.data.referenceImages.length
                  ? {
                      image:
                        input.data.referenceImages.length === 1
                          ? input.data.referenceImages[0]
                          : input.data.referenceImages,
                    }
                  : {}),
                ...(resolvedModelId === "dola-seedream-5-0-pro-260628"
                  ? {}
                  : {
                      sequential_image_generation:
                        input.data.outputCount > 1 ? "auto" : "disabled",
                      ...(input.data.outputCount > 1
                        ? {
                            sequential_image_generation_options: {
                              max_images: input.data.outputCount,
                            },
                          }
                        : {}),
                    }),
                response_format: "url",
                watermark: input.data.watermark,
              }),
            },
            timeoutMs,
            idleTimeoutMs,
          );
          await assertSuccessfulResponse(response);
          const data = await parseJsonResponse(response, imageResponseSchema);
          const providerRequestId =
            data.id ?? stableRequestId("image", submission.idempotencyKey);
          logger.info("BytePlus image generation succeeded", {
            providerRequestId,
            modelId: resolvedModelId,
          });
          return {
            providerRequestId,
            status: "succeeded",
            outputUrls: data.data.map((item) => item.url),
            rawUsage: data.usage,
          };
        }

        case "video": {
          const input = bytePlusVideoInputSchema.safeParse(submission.input);
          if (!input.success) {
            throw new ProviderRequestError(
              "Invalid BytePlus video input",
              false,
              {
                code: "INVALID_INPUT",
              },
            );
          }
          if (resolvedModelId === "omnihuman-1.5") {
            return submitOmniHumanVisionTask(
              {
                accessKeyId: validated.visionAccessKeyId,
                secretAccessKey: validated.visionSecretAccessKey,
                baseUrl: validated.visionBaseUrl,
                requestTimeoutMs: timeoutMs,
                idleTimeoutMs,
                fetch: fetchClient,
              },
              input.data,
            );
          }
          if (!validated.apiKey) {
            throw new ProviderConfigurationError(
              "BytePlus ModelArk API key is required for Seedance video generation",
            );
          }
          const legacySources = [
            ...(input.data.firstFrameImage
              ? [
                  {
                    role: "FIRST_FRAME" as const,
                    url: input.data.firstFrameImage,
                  },
                ]
              : []),
            ...(input.data.lastFrameImage
              ? [
                  {
                    role: "LAST_FRAME" as const,
                    url: input.data.lastFrameImage,
                  },
                ]
              : []),
            ...(input.data.referenceVideoUrl
              ? [
                  {
                    role: "REFERENCE_VIDEO" as const,
                    url: input.data.referenceVideoUrl,
                  },
                ]
              : []),
          ];
          const sources =
            input.data.sources.length > 0 ? input.data.sources : legacySources;
          const mediaContent = sources.map((source) => {
            switch (source.role) {
              case "FIRST_FRAME":
                return {
                  type: "image_url",
                  image_url: { url: source.url },
                  role: "first_frame",
                };
              case "LAST_FRAME":
                return {
                  type: "image_url",
                  image_url: { url: source.url },
                  role: "last_frame",
                };
              case "REFERENCE_IMAGE":
                return {
                  type: "image_url",
                  image_url: { url: source.url },
                  role: "reference_image",
                };
              case "REFERENCE_AUDIO":
                return {
                  type: "audio_url",
                  audio_url: { url: source.url },
                  role: "reference_audio",
                };
              case "REFERENCE_VIDEO":
              case "SOURCE_VIDEO":
                return {
                  type: "video_url",
                  video_url: { url: source.url },
                  role: "reference_video",
                };
            }
          });
          const hasReferenceMedia = sources.some((source) =>
            ["REFERENCE_IMAGE", "REFERENCE_VIDEO", "REFERENCE_AUDIO"].includes(
              source.role,
            ),
          );
          const omniTaskType =
            input.data.workflow === "EDIT"
              ? "edit"
              : input.data.workflow === "EXTEND"
                ? "extend"
                : input.data.workflow === "REFERENCE" ||
                    (input.data.workflow === "DRAFT" && hasReferenceMedia) ||
                    Boolean(input.data.referenceVideoUrl)
                  ? "reference"
                  : undefined;

          const requestBody =
            input.data.workflow === "DRAFT_FINAL"
              ? {
                  model: submission.modelId,
                  content: [
                    {
                      type: "draft_task",
                      draft_task: { id: input.data.draftProviderTaskId! },
                    },
                  ],
                  resolution: "1080p",
                  output_format: input.data.outputFormat,
                  return_last_frame: input.data.returnLastFrame,
                  watermark: input.data.watermark,
                }
              : {
                  model: submission.modelId,
                  content: [
                    { type: "text", text: input.data.prompt },
                    ...mediaContent,
                  ],
                  ...(omniTaskType
                    ? { omni_reference_task_type: omniTaskType }
                    : {}),
                  resolution:
                    input.data.resolution === "4K"
                      ? "4k"
                      : input.data.resolution,
                  ratio: input.data.aspectRatio,
                  duration: input.data.durationSeconds,
                  generate_audio: input.data.generateAudio,
                  watermark: input.data.watermark,
                  output_format: input.data.outputFormat,
                  return_last_frame: input.data.returnLastFrame,
                  ...(input.data.workflow === "DRAFT" ? { draft: true } : {}),
                  ...(input.data.seed === undefined
                    ? {}
                    : { seed: input.data.seed }),
                };

          const response = await safeFetch(
            fetchClient,
            `${baseUrl}/contents/generations/tasks`,
            {
              method: "POST",
              headers: modelArkHeaders,
              body: JSON.stringify(requestBody),
            },
            timeoutMs,
            idleTimeoutMs,
          );
          await assertSuccessfulResponse(response);
          const data = await parseJsonResponse(
            response,
            videoCreateResponseSchema,
          );
          logger.info("BytePlus video generation task submitted", {
            providerRequestId: data.id,
            modelId: submission.modelId,
          });
          return { providerRequestId: data.id, status: "submitted" };
        }

        case "voice": {
          if (resolvedModelId === SEED_AUDIO_MODEL_ID) {
            const input = bytePlusSeedAudioInputSchema.safeParse(
              submission.input,
            );
            if (!input.success)
              throw new ProviderRequestError(
                "Invalid Seed Audio input",
                false,
                {
                  code: "INVALID_INPUT",
                },
              );
            if (!validated.speechApiKey)
              throw new ProviderConfigurationError(
                "BytePlus Seed Speech API key is not configured",
              );
            const response = await safeFetch(
              fetchClient,
              `${speechBaseUrl}/tts/create`,
              {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "x-api-key": validated.speechApiKey,
                  "x-api-request-id": requestUuid(submission.idempotencyKey),
                },
                body: JSON.stringify({
                  model: SEED_AUDIO_MODEL_ID,
                  text_prompt: input.data.textPrompt,
                  ...(input.data.referenceAudioUrls.length ||
                  input.data.referenceSpeakerIds.length
                    ? {
                        references: [
                          ...input.data.referenceAudioUrls.map((audio_url) => ({
                            audio_url,
                          })),
                          ...input.data.referenceSpeakerIds.map((speaker) => ({
                            speaker,
                          })),
                        ],
                      }
                    : {}),
                  ...(input.data.referenceImageUrl
                    ? {
                        references: [
                          { image_url: input.data.referenceImageUrl },
                        ],
                      }
                    : {}),
                  audio_config: {
                    format: input.data.format,
                    sample_rate: input.data.sampleRate,
                    speech_rate: speechRateMultiplierToPercentage(
                      input.data.speechRate,
                    ),
                    loudness_rate: speechRateMultiplierToPercentage(
                      input.data.loudnessRate,
                    ),
                    pitch_rate: input.data.pitch,
                    enable_subtitle: input.data.enableSubtitles,
                  },
                  watermark: { aigc_watermark: input.data.watermark },
                }),
              },
              timeoutMs,
              idleTimeoutMs,
            );
            await assertSuccessfulResponse(response);
            const body = await readResponseText(
              response,
              MAX_SPEECH_RESPONSE_BYTES,
            );
            let data: unknown;
            try {
              data = JSON.parse(body);
            } catch {
              throw new ProviderRequestError(
                "BytePlus returned an invalid Seed Audio response",
                true,
                { code: "INVALID_PROVIDER_RESPONSE" },
              );
            }
            const parsed = z
              .object({
                code: z.number().optional(),
                message: z.string().optional(),
                audio: z.string().min(1),
                duration: z.number().positive().max(120).optional(),
                original_duration: z.number().positive().max(120),
                subtitle: z
                  .object({
                    text: z.string().max(12_000),
                    sentences: z
                      .array(
                        z.object({
                          start_time: z.number().int().nonnegative(),
                          end_time: z.number().int().nonnegative(),
                          text: z.string().max(3_000),
                        }),
                      )
                      .max(2_000)
                      .optional(),
                    words: z
                      .array(
                        z.object({
                          start_time: z.number().int().nonnegative(),
                          end_time: z.number().int().nonnegative(),
                          text: z.string().max(500),
                        }),
                      )
                      .max(20_000)
                      .optional(),
                  })
                  .optional(),
              })
              .safeParse(data);
            if (
              !parsed.success ||
              (parsed.data.code !== undefined && parsed.data.code !== 0)
            )
              throw new ProviderRequestError(
                "BytePlus Seed Audio generation failed",
                false,
                { code: "PROVIDER_REJECTED" },
              );
            const requestId = providerIdentifierSchema.safeParse(
              response.headers?.get("x-tt-logid"),
            );
            const mediaType = {
              mp3: "audio/mpeg",
              wav: "audio/wav",
              pcm: "audio/L16",
              ogg_opus: "audio/ogg",
            }[input.data.format];
            const subtitle = parsed.data.subtitle
              ? {
                  text: parsed.data.subtitle.text,
                  sentences: (parsed.data.subtitle.sentences ?? []).map(
                    (sentence) => ({
                      startMs: sentence.start_time,
                      endMs: sentence.end_time,
                      text: sentence.text,
                    }),
                  ),
                  words: (parsed.data.subtitle.words ?? []).map((word) => ({
                    startMs: word.start_time,
                    endMs: word.end_time,
                    text: word.text,
                  })),
                }
              : null;
            return {
              providerRequestId: requestId.success
                ? requestId.data
                : stableRequestId("seed-audio", submission.idempotencyKey),
              status: "succeeded",
              inlineOutputs: [
                { mediaType, dataBase64: parsed.data.audio },
              ],
              rawUsage: {
                generatedSeconds: parsed.data.original_duration,
                durationSeconds: parsed.data.duration ?? null,
                subtitle,
              },
            };
          }
          const input = bytePlusVoiceInputSchema.safeParse(submission.input);
          if (!input.success) {
            throw new ProviderRequestError(
              "Invalid BytePlus voice input",
              false,
              {
                code: "INVALID_INPUT",
              },
            );
          }
          if (!validated.speechApiKey) {
            throw new ProviderConfigurationError(
              "BytePlus Seed Speech API key is not configured",
            );
          }

          const speechHeaders: Record<string, string> = {
            "content-type": "application/json",
            "x-api-request-id": requestUuid(submission.idempotencyKey),
            "x-api-resource-id": SPEECH_RESOURCE_ID,
          };
          speechHeaders["x-api-key"] = validated.speechApiKey;
          speechHeaders["x-api-app-key"] =
            validated.speechAppKey ?? DEFAULT_SPEECH_APP_KEY;

          const response = await safeFetch(
            fetchClient,
            `${speechBaseUrl}/tts/unidirectional`,
            {
              method: "POST",
              headers: speechHeaders,
              body: JSON.stringify({
                user: { id: "creator-platform" },
                req_params: {
                  text: input.data.text,
                  speaker: input.data.speaker,
                  audio_params: {
                    format: input.data.format,
                    sample_rate: input.data.sampleRate,
                    ...(input.data.qualityProfile === "production" &&
                    input.data.format !== "pcm"
                      ? { bit_rate: input.data.bitRate }
                      : {}),
                    speech_rate: speechRateMultiplierToPercentage(
                      input.data.speechRate,
                    ),
                    loudness_rate: speechRateMultiplierToPercentage(
                      input.data.loudnessRate,
                    ),
                  },
                  ...(input.data.qualityProfile === "production"
                    ? {
                        additions: JSON.stringify({
                          ...(input.data.stylePrompt
                            ? { context_texts: [input.data.stylePrompt] }
                            : {}),
                          ...(input.data.pitch !== 0
                            ? { post_process: { pitch: input.data.pitch } }
                            : {}),
                        }),
                      }
                    : {}),
                },
              }),
            },
            timeoutMs,
            idleTimeoutMs,
          );
          await assertSuccessfulResponse(response);
          const responseBody = await readResponseText(
            response,
            MAX_SPEECH_RESPONSE_BYTES,
          );
          const chunks = parseSpeechChunks(responseBody);
          const audio = decodeSpeechAudio(chunks);
          const responseLogId = providerIdentifierSchema.safeParse(
            response.headers?.get("x-tt-logid"),
          );
          const providerRequestId =
            (responseLogId.success ? responseLogId.data : undefined) ??
            chunks.find((chunk) => chunk.reqid)?.reqid ??
            stableRequestId("speech", submission.idempotencyKey);
          logger.info("BytePlus speech synthesis succeeded", {
            providerRequestId,
            modelId: submission.modelId,
            outputBytes: audio.byteLength,
          });
          return {
            providerRequestId,
            status: "succeeded",
            inlineOutputs: [
              {
                mediaType: audioMediaType(input.data.format),
                dataBase64: audio.toString("base64"),
              },
            ],
            rawUsage: { outputBytes: audio.byteLength },
          };
        }

        case "text": {
          if (!validated.apiKey) {
            throw new ProviderConfigurationError(
              "BytePlus ModelArk API key is required for text generation",
            );
          }
          const input = bytePlusTextInputSchema.safeParse(submission.input);
          if (!input.success) {
            throw new ProviderRequestError(
              "Invalid BytePlus text input",
              false,
              {
                code: "INVALID_INPUT",
              },
            );
          }

          const response = await safeFetch(
            fetchClient,
            `${baseUrl}/chat/completions`,
            {
              method: "POST",
              headers: modelArkHeaders,
              body: JSON.stringify({
                model: submission.modelId,
                messages: input.data.messages,
                temperature: input.data.temperature,
                max_tokens: input.data.maxTokens,
                ...(input.data.topP !== undefined
                  ? { top_p: input.data.topP }
                  : {}),
                ...(input.data.responseFormat === "json_object"
                  ? { response_format: { type: "json_object" } }
                  : {}),
              }),
            },
            timeoutMs,
            idleTimeoutMs,
          );
          await assertSuccessfulResponse(response);
          const data = await parseJsonResponse(response, textResponseSchema);
          const choice = data.choices[0];
          const content = choice?.message?.content ?? "";
          const providerRequestId =
            data.id ?? stableRequestId("text", submission.idempotencyKey);
          logger.info("BytePlus text generation completed", {
            providerRequestId,
            modelId: submission.modelId,
            totalTokens: data.usage?.total_tokens,
          });
          return {
            providerRequestId,
            status: "succeeded",
            inlineOutputs: [
              {
                mediaType: "text/plain",
                dataBase64: Buffer.from(content, "utf8").toString("base64"),
              },
            ],
            textOutput: { content },
            rawUsage: data.usage,
          };
        }
      }
    },

    async getJob(providerRequestId: string): Promise<ProviderJob> {
      if (isOmniHumanVisionRequestId(providerRequestId)) {
        return getOmniHumanVisionJob(
          {
            accessKeyId: validated.visionAccessKeyId,
            secretAccessKey: validated.visionSecretAccessKey,
            baseUrl: validated.visionBaseUrl,
            requestTimeoutMs: timeoutMs,
            idleTimeoutMs,
            fetch: fetchClient,
          },
          providerRequestId,
        );
      }
      if (!validated.apiKey) {
        throw new ProviderConfigurationError(
          "BytePlus ModelArk API key is required",
        );
      }
      const safeProviderRequestId = parseProviderRequestId(providerRequestId);
      logger.debug("Polling BytePlus task status", {
        providerRequestId: safeProviderRequestId,
      });
      const response = await safeFetch(
        fetchClient,
        `${baseUrl}/contents/generations/tasks/${encodeURIComponent(safeProviderRequestId)}`,
        {
          method: "GET",
          headers: { authorization: `Bearer ${validated.apiKey}` },
        },
        timeoutMs,
        idleTimeoutMs,
      );
      await assertSuccessfulResponse(response);
      const data = await parseJsonResponse(response, videoTaskResponseSchema);
      const status = mapTaskStatus(data.status);
      const outputUrl = data.content?.video_url;
      if (status === "succeeded" && !outputUrl) {
        throw new ProviderRequestError(
          "BytePlus succeeded without a video output",
          true,
          { code: "INVALID_PROVIDER_RESPONSE" },
        );
      }
      logger.info("BytePlus task polled", {
        providerRequestId: data.id,
        status,
      });
      return {
        providerRequestId: data.id,
        status,
        outputUrls: outputUrl ? [outputUrl] : undefined,
        lastFrameUrl: data.content?.last_frame_url,
        rawUsage: data.usage,
        errorCode:
          status === "failed"
            ? (data.error?.code ??
              (data.status.toLowerCase() === "expired"
                ? "TASK_EXPIRED"
                : "TASK_FAILED"))
            : undefined,
      };
    },

    async cancel(providerRequestId: string): Promise<void> {
      if (isOmniHumanVisionRequestId(providerRequestId)) {
        await cancelOmniHumanVisionJob(
          {
            accessKeyId: validated.visionAccessKeyId,
            secretAccessKey: validated.visionSecretAccessKey,
            baseUrl: validated.visionBaseUrl,
            requestTimeoutMs: timeoutMs,
            idleTimeoutMs,
            fetch: fetchClient,
          },
          providerRequestId,
        );
        return;
      }
      if (!validated.apiKey) {
        throw new ProviderConfigurationError(
          "BytePlus ModelArk API key is required",
        );
      }
      const safeProviderRequestId = parseProviderRequestId(providerRequestId);
      logger.info("Cancelling BytePlus task", {
        providerRequestId: safeProviderRequestId,
      });
      const response = await safeFetch(
        fetchClient,
        `${baseUrl}/contents/generations/tasks/${encodeURIComponent(safeProviderRequestId)}`,
        {
          method: "DELETE",
          headers: { authorization: `Bearer ${validated.apiKey}` },
        },
        timeoutMs,
        idleTimeoutMs,
      );
      await assertSuccessfulResponse(response);
      await cancelAbandonedBody(response);
    },
  };
}

export { diagnoseOmniHumanVision } from "./vision";

export * from "./mediakit";
