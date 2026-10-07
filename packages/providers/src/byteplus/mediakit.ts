import { createHash } from "node:crypto";

import { z } from "zod";

import {
  ProviderConfigurationError,
  ProviderRequestError,
  type MediaToolProvider,
  type ProviderToolDescriptor,
  type ProviderToolSubmission,
  type ProviderToolTask,
  type ProviderToolStatus,
} from "../index";
import {
  cancelAbandonedBody,
  executeSafeFetch,
  sharedReadResponseText,
} from "../http";

const DEFAULT_BASE_URL = "https://mediakit.ap-southeast-1.bytepluses.com";
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export const BYTEPLUS_MEDIAKIT_TOOLS: readonly ProviderToolDescriptor[] = [
  {
    id: "lip-sync",
    provider: "byteplus-mediakit",
    displayName: "Video Lip Sync",
    description: "Synchronize portrait video lip movement to driving audio.",
    category: "video",
    executionMode: "async",
    endpoint: "/api/v1/tools/lip-sync",
    pricingMetric: "OUTPUT_SECOND",
    capabilities: { videoInput: true, audioInput: true, outputVideo: true },
  },
  {
    id: "matte-portrait-video",
    provider: "byteplus-mediakit",
    displayName: "Portrait Video Matting",
    description: "Remove the background from portrait video.",
    category: "video",
    executionMode: "async",
    endpoint: "/api/v1/tools/matte-portrait-video",
    pricingMetric: "INPUT_SECOND",
    capabilities: { videoInput: true, alphaOutput: true, outputVideo: true },
  },
  {
    id: "matte-greenscreen-video",
    provider: "byteplus-mediakit",
    displayName: "Green Screen Matting",
    description: "Remove green or solid-color backgrounds from video.",
    category: "video",
    executionMode: "async",
    endpoint: "/api/v1/tools/matte-greenscreen-video",
    pricingMetric: "INPUT_SECOND",
    capabilities: { videoInput: true, alphaOutput: true, outputVideo: true },
  },
  {
    id: "semantic-segment",
    provider: "byteplus-mediakit",
    displayName: "Semantic Video Segmentation",
    description: "Split long video into semantically coherent segments.",
    category: "video",
    executionMode: "async",
    endpoint: "/api/v1/tools/semantic-segment",
    pricingMetric: "INPUT_SECOND",
    capabilities: { videoInput: true, analysisOutput: true },
  },
  {
    id: "assess-video-quality",
    provider: "byteplus-mediakit",
    displayName: "Video Quality Assessment",
    description: "Assess perceptual video quality with VQScore.",
    category: "video",
    executionMode: "async",
    endpoint: "/api/v1/tools/assess-video-quality",
    pricingMetric: "INPUT_SECOND",
    capabilities: { videoInput: true, analysisOutput: true },
  },
  {
    id: "enhance-video-smoothness",
    provider: "byteplus-mediakit",
    displayName: "Video Smoothness Enhancement",
    description:
      "Detect and repair periodic stutter and duplicate frames while preserving OmniHuman timing.",
    category: "video",
    executionMode: "async",
    endpoint: "/api/v1/tools/enhance-video-smoothness",
    pricingMetric: "INPUT_SECOND",
    capabilities: {
      videoInput: true,
      outputVideo: true,
      analysisOutput: true,
      maxRepairDurationSeconds: 35,
      variableBilling: "output-presence",
      defaultRepair: true,
    },
  },
  {
    id: "text-to-scrolling-video",
    provider: "byteplus-mediakit",
    displayName: "Text to Scrolling Video",
    description: "Render text into a vertical scrolling video.",
    category: "video",
    executionMode: "async",
    endpoint: "/api/v1/tools/text-to-scrolling-video",
    pricingMetric: "OUTPUT_SECOND",
    capabilities: { textInput: true, outputVideo: true, verticalOutput: true },
  },
  {
    id: "compress-image",
    provider: "byteplus-mediakit",
    displayName: "Image Compression",
    description: "Compress or convert an image with explicit quality controls.",
    category: "image",
    executionMode: "sync",
    endpoint: "/api/v1/tools-sync/compress-image",
    pricingMetric: "REQUEST",
    capabilities: { imageInput: true, imageOutput: true },
  },
  {
    id: "slim-image",
    provider: "byteplus-mediakit",
    displayName: "Intelligent Image Compression",
    description: "Use AI-assisted compression to reduce image size.",
    category: "image",
    executionMode: "sync",
    endpoint: "/api/v1/tools-sync/slim-image",
    pricingMetric: "REQUEST",
    capabilities: { imageInput: true, imageOutput: true },
  },
  {
    id: "crop-image",
    provider: "byteplus-mediakit",
    displayName: "Image Crop",
    description: "Crop an image using MediaKit's synchronous image pipeline.",
    category: "image",
    executionMode: "sync",
    endpoint: "/api/v1/tools-sync/crop-image",
    pricingMetric: "REQUEST",
    capabilities: { imageInput: true, imageOutput: true },
  },
  {
    id: "face-blur-image",
    provider: "byteplus-mediakit",
    displayName: "Face Blur",
    description: "Detect and obscure faces in an image.",
    category: "image",
    executionMode: "sync",
    endpoint: "/api/v1/tools-sync/face-blur-image",
    pricingMetric: "REQUEST",
    capabilities: { imageInput: true, imageOutput: true, privacyTool: true },
  },
  {
    id: "mosaic-image",
    provider: "byteplus-mediakit",
    displayName: "Image Pixelation",
    description: "Pixelate an image or selected image region.",
    category: "image",
    executionMode: "sync",
    endpoint: "/api/v1/tools-sync/mosaic-image",
    pricingMetric: "REQUEST",
    capabilities: { imageInput: true, imageOutput: true },
  },
  {
    id: "add-image-watermark",
    provider: "byteplus-mediakit",
    displayName: "Image Watermark",
    description: "Apply text or image watermarks to an image.",
    category: "image",
    executionMode: "sync",
    endpoint: "/api/v1/tools-sync/add-image-watermark",
    pricingMetric: "REQUEST",
    capabilities: { imageInput: true, imageOutput: true, watermark: true },
  },
] as const;

const toolById = new Map(
  BYTEPLUS_MEDIAKIT_TOOLS.map((tool) => [tool.id, tool]),
);

const httpsUrlSchema = z
  .url()
  .refine(
    (value) => new URL(value).protocol === "https:",
    "HTTPS URL required",
  );

const configSchema = z.object({
  apiKey: z.string().trim().min(1),
  baseUrl: httpsUrlSchema.default(DEFAULT_BASE_URL),
  requestTimeoutMs: z
    .number()
    .int()
    .positive()
    .max(600_000)
    .default(DEFAULT_TIMEOUT_MS),
  idleTimeoutMs: z
    .number()
    .int()
    .positive()
    .max(600_000)
    .default(DEFAULT_IDLE_TIMEOUT_MS),
});

const objectSchema = z.record(z.string(), z.unknown());
const providerVideoUrlSchema = z
  .url()
  .refine((value) => new URL(value).protocol === "https:", "HTTPS URL required");

const portraitMattingInputSchema = z
  .object({
    video_url: providerVideoUrlSchema,
    format: z.enum(["WEBM", "MP4"]).default("WEBM"),
    background_color: z.enum(["black", "white", "green"]).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.format !== "MP4" && value.background_color !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["background_color"],
        message: "background_color is only supported for MP4 matting output",
      });
    }
  });

const videoQualityInputSchema = z
  .object({ video_url: providerVideoUrlSchema })
  .strict();

const videoSmoothnessInputSchema = z
  .object({
    video_url: providerVideoUrlSchema,
    periodic_stutter_detect: z
      .object({
        periodic_stutter_repair: z.boolean().default(true),
        align_source_fps: z.boolean().default(true),
      })
      .strict()
      .optional(),
    duplicate_frame_detect: z
      .object({ duplicate_frame_repair: z.boolean().default(true) })
      .strict()
      .optional(),
  })
  .strict();
const asyncSubmitSchema = z
  .object({
    success: z.boolean(),
    task_id: z.string().trim().min(1).max(191).optional(),
    request_id: z.string().trim().min(1).max(191).optional(),
    error: z
      .object({
        code: z.string().max(128).optional(),
        type: z.string().max(128).optional(),
        message: z.string().max(2_000).optional(),
        param: z.string().max(128).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const taskSchema = z
  .object({
    success: z.boolean().optional().default(true),
    task_id: z.string().trim().min(1).max(191).optional(),
    request_id: z.string().trim().min(1).max(191).optional(),
    status: z.string().trim().min(1).max(64).optional(),
    result: objectSchema.optional(),
    error: z
      .object({
        code: z.string().max(128).optional(),
        type: z.string().max(128).optional(),
        message: z.string().max(2_000).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const RESERVED_INPUT_KEYS = new Set([
  "client_token",
  "callback_url",
  "callback_args",
]);

function normalizedBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function clientToken(idempotencyKey: string): string {
  return `aiwa_${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 56)}`;
}

function normalizeStatus(value: string | undefined): ProviderToolStatus {
  switch ((value ?? "").toLowerCase()) {
    case "completed":
    case "succeeded":
    case "success":
      return "succeeded";
    case "failed":
    case "error":
      return "failed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "processing":
    case "running":
      return "processing";
    default:
      return "submitted";
  }
}

function sanitizeInput(
  toolId: string,
  input: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const parsed = objectSchema.parse(input);
  for (const key of RESERVED_INPUT_KEYS) {
    if (key in parsed) {
      throw new ProviderRequestError(
        `MediaKit input field '${key}' is reserved by the platform`,
        false,
        { code: "INVALID_TOOL_INPUT", stage: "dispatch" },
      );
    }
  }

  const schema =
    toolId === "matte-portrait-video"
      ? portraitMattingInputSchema
      : toolId === "assess-video-quality"
        ? videoQualityInputSchema
        : toolId === "enhance-video-smoothness"
          ? videoSmoothnessInputSchema
          : null;
  if (!schema) return { ...parsed };

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ProviderRequestError("Invalid MediaKit tool input", false, {
      code: "INVALID_TOOL_INPUT",
      stage: "dispatch",
    });
  }
  return result.data;
}

export function isBytePlusMediaKitConfigured(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return Boolean(environment.BYTEPLUS_MEDIAKIT_API_KEY?.trim());
}

export interface BytePlusMediaKitConfig {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly requestTimeoutMs?: number;
  readonly idleTimeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
}

export function createBytePlusMediaKitProvider(
  input: BytePlusMediaKitConfig,
): MediaToolProvider {
  const parsed = configSchema.safeParse({
    apiKey: input.apiKey,
    baseUrl: input.baseUrl ?? DEFAULT_BASE_URL,
    requestTimeoutMs: input.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS,
    idleTimeoutMs: input.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
  });
  if (!parsed.success) {
    throw new ProviderConfigurationError(
      "Invalid BytePlus MediaKit configuration.",
    );
  }
  const config = parsed.data;
  const fetchFn = input.fetch ?? globalThis.fetch;

  async function request(path: string, init: RequestInit): Promise<unknown> {
    const response = await executeSafeFetch(
      fetchFn,
      normalizedBaseUrl(config.baseUrl) + path,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(init.headers ?? {}),
        },
      },
      {
        providerName: "BytePlus",
        timeoutMs: config.requestTimeoutMs,
        idleTimeoutMs: config.idleTimeoutMs,
      },
    );

    let text: string;
    try {
      text = await sharedReadResponseText(response, MAX_RESPONSE_BYTES, {
        providerName: "BytePlus",
      });
    } finally {
      await cancelAbandonedBody(response);
    }

    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch (error) {
      throw new ProviderRequestError(
        "MediaKit returned invalid JSON",
        response.status >= 500,
        {
          cause: error,
          code: "INVALID_PROVIDER_RESPONSE",
          stage: "parsing",
        },
      );
    }

    if (!response.ok) {
      const body =
        payload && typeof payload === "object"
          ? (payload as Record<string, unknown>)
          : {};
      const error =
        body.error && typeof body.error === "object"
          ? (body.error as Record<string, unknown>)
          : {};
      const code =
        typeof error.code === "string" ? error.code : `HTTP_${response.status}`;
      throw new ProviderRequestError(
        "MediaKit request failed",
        response.status === 429 || response.status >= 500,
        {
          code,
          stage: "response_body",
        },
      );
    }

    return payload;
  }

  return {
    name: "byteplus-mediakit",
    listTools() {
      return BYTEPLUS_MEDIAKIT_TOOLS;
    },
    async submit(
      submission: ProviderToolSubmission,
    ): Promise<ProviderToolTask> {
      const tool = toolById.get(submission.toolId);
      if (!tool) {
        throw new ProviderRequestError("Unknown MediaKit tool", false, {
          code: "UNSUPPORTED_TOOL",
          stage: "dispatch",
        });
      }
      const payload = await request(tool.endpoint, {
        method: "POST",
        body: JSON.stringify({
          ...sanitizeInput(tool.id, submission.input),
          client_token: clientToken(submission.idempotencyKey),
        }),
      });

      const parsedPayload = asyncSubmitSchema.safeParse(payload);
      if (!parsedPayload.success) {
        throw new ProviderRequestError(
          "MediaKit returned an invalid submission response",
          true,
          {
            code: "INVALID_PROVIDER_RESPONSE",
            stage: "parsing",
          },
        );
      }
      const body = parsedPayload.data;
      if (body.success === false) {
        throw new ProviderRequestError(
          "MediaKit rejected the tool request",
          false,
          {
            code: body.error?.code ?? "PROVIDER_REJECTED",
            stage: "response_body",
          },
        );
      }

      if (tool.executionMode === "async") {
        if (!body.task_id) {
          throw new ProviderRequestError(
            "MediaKit did not return a task identifier",
            true,
            {
              code: "MISSING_PROVIDER_TASK_ID",
              stage: "parsing",
            },
          );
        }
        return {
          providerTaskId: body.task_id,
          providerRequestId: body.request_id,
          status: "submitted",
        };
      }

      const sync = taskSchema.safeParse(payload);
      if (!sync.success) {
        throw new ProviderRequestError(
          "MediaKit returned an invalid synchronous response",
          true,
          {
            code: "INVALID_PROVIDER_RESPONSE",
            stage: "parsing",
          },
        );
      }
      return {
        providerTaskId: sync.data.task_id,
        providerRequestId: sync.data.request_id,
        status: sync.data.success === false ? "failed" : "succeeded",
        result: sync.data.result ?? (payload as Record<string, unknown>),
        errorCode: sync.data.error?.code,
      };
    },
    async getTask(providerTaskId: string): Promise<ProviderToolTask> {
      if (!/^[A-Za-z0-9._:-]{1,191}$/.test(providerTaskId)) {
        throw new ProviderRequestError(
          "Invalid MediaKit task identifier",
          false,
          {
            code: "INVALID_PROVIDER_TASK_ID",
            stage: "dispatch",
          },
        );
      }
      const payload = await request(
        `/api/v1/tasks/${encodeURIComponent(providerTaskId)}`,
        { method: "GET" },
      );
      const parsedPayload = taskSchema.safeParse(payload);
      if (!parsedPayload.success) {
        throw new ProviderRequestError(
          "MediaKit returned an invalid task response",
          true,
          {
            code: "INVALID_PROVIDER_RESPONSE",
            stage: "parsing",
          },
        );
      }
      const body = parsedPayload.data;
      const status =
        body.success === false ? "failed" : normalizeStatus(body.status);
      return {
        providerTaskId: body.task_id ?? providerTaskId,
        providerRequestId: body.request_id,
        status,
        result: body.result,
        errorCode: body.error?.code,
      };
    },
  };
}

export function bytePlusMediaKitClientToken(idempotencyKey: string): string {
  return clientToken(idempotencyKey);
}
