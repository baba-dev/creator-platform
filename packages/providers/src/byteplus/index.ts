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
const DEFAULT_SPEECH_APP_KEY = "aGjiRDfUWi";

export interface BytePlusAdapterConfig {
  readonly apiKey?: string;
  readonly region: keyof typeof MODELARK_BASE_URLS;
  readonly modelArkBaseUrl?: string;
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

export const bytePlusImageInputSchema = z.object({
  prompt: z.string().trim().min(1),
  aspectRatio: imageAspectRatioSchema.default("1:1"),
  resolution: z.enum(["2K", "4K"]).default("2K"),
  outputFormat: z.enum(["jpeg", "png"]).default("png"),
  watermark: z.boolean().default(false),
});

export const bytePlusVideoInputSchema = z.object({
  prompt: z.string().trim().min(1),
  aspectRatio: z
    .enum(["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"])
    .default("16:9"),
  resolution: z.enum(["480p", "720p", "1080p"]).default("720p"),
  durationSeconds: z.number().int().min(4).max(30).default(5),
  generateAudio: z.boolean().default(false),
  watermark: z.boolean().default(false),
  seed: z.number().int().min(-1).max(2_147_483_647).optional(),
});

export const bytePlusVoiceInputSchema = z.object({
  text: z.string().trim().min(1),
  speaker: z.string().trim().min(1),
  format: z.enum(["mp3", "ogg_opus", "pcm"]).default("mp3"),
  sampleRate: z
    .union([z.literal(8_000), z.literal(16_000), z.literal(24_000)])
    .default(24_000),
  // Application-facing multiplier. BytePlus receives an integer percentage.
  speechRate: z.number().min(0.5).max(2).default(1),
});

export function speechRateMultiplierToPercentage(multiplier: number): number {
  const parsed = z.number().min(0.5).max(2).safeParse(multiplier);
  if (!parsed.success) {
    throw new RangeError("speechRate multiplier must be between 0.5 and 2");
  }
  return Math.round((parsed.data - 1) * 100);
}

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
      "aspectRatio:16:9": true,
      "aspectRatio:9:16": true,
      "resolution:2K": true,
      "resolution:4K": true,
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
      "aspectRatio:16:9": true,
      "aspectRatio:9:16": true,
      "resolution:2K": true,
      "resolution:4K": true,
    },
  },
  {
    id: "dreamina-seedance-2-5-260628",
    provider: "byteplus",
    displayName: "Seedance 2.5",
    description: "Cinematic video generation with optional synchronized audio.",
    mediaKind: "video",
    capabilities: {
      "aspectRatio:16:9": true,
      "aspectRatio:9:16": true,
      "aspectRatio:1:1": true,
      "resolution:720p": true,
      "resolution:1080p": true,
      "durationSeconds:5": true,
      "durationSeconds:10": true,
      minimumDurationSeconds: 4,
      maximumDurationSeconds: 30,
      fps: 24,
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
      "format:mp3": true,
      "format:ogg_opus": true,
      "format:pcm": true,
    },
  },
];

const imageResponseSchema = z.object({
  id: providerIdentifierSchema.optional(),
  data: z.array(z.object({ url: httpsUrlSchema })).min(1),
  usage: z.record(z.string(), z.unknown()).optional(),
});

const videoCreateResponseSchema = z.object({ id: providerIdentifierSchema });

const videoTaskResponseSchema = z.object({
  id: providerIdentifierSchema,
  status: z.string().min(1),
  content: z.object({ video_url: httpsUrlSchema.optional() }).optional(),
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
  resolution: "2K" | "4K",
): string {
  const sizes = {
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
    "4K": {
      "1:1": "4096x4096",
      "16:9": "5696x3200",
      "9:16": "3200x5696",
      "4:3": "4608x3456",
      "3:4": "3456x4608",
      "3:2": "4992x3328",
      "2:3": "3328x4992",
      "21:9": "6272x2688",
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

function assertModelSupportsMediaKind(
  modelId: string,
  mediaKind: MediaKind,
): void {
  const model = VERIFIED_BYTEPLUS_MODELS.find((item) => item.id === modelId);
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
  const hasSpeechConfig = Boolean(validated.speechApiKey);
  if (!hasMediaConfig && !hasSpeechConfig) {
    throw new ProviderConfigurationError(
      "BytePlus adapter configuration is invalid: neither ModelArk nor Speech credentials are provided",
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
      assertModelSupportsMediaKind(submission.modelId, submission.mediaKind);
      logger.info("Submitting BytePlus media generation job", {
        modelId: submission.modelId,
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
          const response = await safeFetch(
            fetchClient,
            `${baseUrl}/images/generations`,
            {
              method: "POST",
              headers: modelArkHeaders,
              body: JSON.stringify({
                model: submission.modelId,
                prompt: input.data.prompt,
                size: mapAspectRatioToSize(
                  input.data.aspectRatio,
                  input.data.resolution,
                ),
                ...(submission.modelId === "seedream-5-0-260128"
                  ? { output_format: input.data.outputFormat }
                  : {}),
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
            modelId: submission.modelId,
          });
          return {
            providerRequestId,
            status: "succeeded",
            outputUrls: data.data.map((item) => item.url),
            rawUsage: data.usage,
          };
        }

        case "video": {
          if (!validated.apiKey) {
            throw new ProviderConfigurationError(
              "BytePlus ModelArk API key is required for image and video generation",
            );
          }
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
          const response = await safeFetch(
            fetchClient,
            `${baseUrl}/contents/generations/tasks`,
            {
              method: "POST",
              headers: modelArkHeaders,
              body: JSON.stringify({
                model: submission.modelId,
                content: [{ type: "text", text: input.data.prompt }],
                resolution: input.data.resolution,
                ratio: input.data.aspectRatio,
                duration: input.data.durationSeconds,
                generate_audio: input.data.generateAudio,
                watermark: input.data.watermark,
                ...(input.data.seed === undefined
                  ? {}
                  : { seed: input.data.seed }),
              }),
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
                    speech_rate: speechRateMultiplierToPercentage(
                      input.data.speechRate,
                    ),
                  },
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
      }
    },

    async getJob(providerRequestId: string): Promise<ProviderJob> {
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
