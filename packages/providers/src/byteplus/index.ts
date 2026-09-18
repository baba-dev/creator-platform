import { createLogger } from "@aiwa/observability";
import { z } from "zod";

import {
  ProviderConfigurationError,
  ProviderRequestError,
  type MediaGenerationProvider,
  type MediaSubmission,
  type ProviderJob,
  type ProviderJobStatus,
  type ProviderModelDescriptor,
} from "../index";

export interface BytePlusAdapterConfig {
  readonly apiKey: string;
  readonly region: string;
  readonly modelArkBaseUrl?: string;
  readonly speechAppId?: string;
  readonly speechAccessToken?: string;
  readonly fetch?: typeof globalThis.fetch;
}

export const bytePlusImageInputSchema = z.object({
  prompt: z.string().trim().min(1, "Prompt is required"),
  aspectRatio: z.string().trim().optional(),
  steps: z.number().int().min(1).max(100).optional(),
  style: z.string().trim().optional(),
  seed: z.number().int().optional(),
});

export const bytePlusVideoInputSchema = z.object({
  prompt: z.string().trim().min(1, "Prompt is required"),
  aspectRatio: z.string().trim().optional(),
  durationSeconds: z.union([z.literal(5), z.literal(10)]).optional(),
  fps: z.number().int().min(1).max(60).optional(),
  seed: z.number().int().optional(),
});

export const bytePlusVoiceInputSchema = z
  .object({
    prompt: z.string().trim().min(1).optional(),
    text: z.string().trim().min(1).optional(),
    language: z.string().trim().optional(),
    voiceType: z.string().trim().optional(),
    speedRatio: z.number().min(0.2).max(3.0).optional(),
  })
  .refine((data) => Boolean(data.prompt || data.text), {
    message: "Either prompt or text must be provided for voice generation",
  });

export const VERIFIED_BYTEPLUS_MODELS: readonly ProviderModelDescriptor[] = [
  {
    id: "seedream-5-lite",
    provider: "byteplus",
    displayName: "Seedream 5.0 Lite",
    description:
      "Prompt-aware image creation with strong consistency and editing control.",
    mediaKind: "image",
    capabilities: {
      "aspectRatio:1:1": true,
      "aspectRatio:16:9": true,
      "aspectRatio:9:16": true,
      "aspectRatio:4:5": true,
      maxSteps: 50,
      defaultSteps: 30,
    },
  },
  {
    id: "seedream-4-5",
    provider: "byteplus",
    displayName: "Seedream 4.5",
    description:
      "Reliable 4K campaign visuals, typography, and multi-reference composition.",
    mediaKind: "image",
    capabilities: {
      "aspectRatio:1:1": true,
      "aspectRatio:16:9": true,
      "aspectRatio:9:16": true,
      "aspectRatio:4:5": true,
      resolution: "4k",
    },
  },
  {
    id: "seedance-2-5",
    provider: "byteplus",
    displayName: "Seedance 2.5",
    description:
      "Cinematic multi-shot video generation with rich multimodal direction.",
    mediaKind: "video",
    capabilities: {
      "aspectRatio:16:9": true,
      "aspectRatio:9:16": true,
      "aspectRatio:1:1": true,
      "duration:5": true,
      "duration:10": true,
    },
  },
  {
    id: "seed-speech-2",
    provider: "byteplus",
    displayName: "Seed Speech TTS 2.0",
    description:
      "Expressive, context-aware narration with natural rhythm and pauses.",
    mediaKind: "voice",
    capabilities: {
      "language:en": true,
      "language:ar": true,
      "language:hi": true,
    },
  },
];

function mapAspectRatioToSize(aspectRatio?: string): string {
  switch (aspectRatio) {
    case "16:9":
      return "1920x1080";
    case "9:16":
      return "1080x1920";
    case "4:5":
      return "864x1080";
    case "1:1":
    default:
      return "1024x1024";
  }
}

function mapTaskStatus(status?: string): ProviderJobStatus {
  switch (status?.toUpperCase()) {
    case "SUCCEEDED":
    case "SUCCESS":
      return "succeeded";
    case "RUNNING":
    case "PROCESSING":
      return "processing";
    case "FAILED":
    case "ERROR":
      return "failed";
    case "QUEUED":
    case "PENDING":
    case "SUBMITTED":
    default:
      return "submitted";
  }
}

export function mapBytePlusError(
  status: number,
  bodyText: string,
): ProviderRequestError {
  let errorMessage = `BytePlus API returned status ${status}`;
  let isRateLimitOrThrottle = false;

  try {
    const parsed = JSON.parse(bodyText) as {
      error?: { message?: string; code?: string };
      message?: string;
    };
    const msg = parsed.error?.message ?? parsed.message;
    if (msg) {
      errorMessage = msg;
    }
    if (
      parsed.error?.code === "RateLimitExceeded" ||
      parsed.error?.code === "RESOURCE_EXHAUSTED" ||
      /rate limit|too many requests|throttled/i.test(errorMessage)
    ) {
      isRateLimitOrThrottle = true;
    }
  } catch {
    if (bodyText.length > 0 && bodyText.length < 200) {
      errorMessage = bodyText;
    }
  }

  const retryable =
    status === 429 || isRateLimitOrThrottle || (status >= 500 && status <= 504);

  return new ProviderRequestError(errorMessage, retryable);
}

async function safeFetch(
  fetchFn: typeof globalThis.fetch,
  url: string,
  options: RequestInit,
): Promise<Response> {
  try {
    return await fetchFn(url, options);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    throw new ProviderRequestError(
      `BytePlus network failure: ${message}`,
      true,
      { cause: err },
    );
  }
}

export function createBytePlusProvider(
  config: BytePlusAdapterConfig,
): MediaGenerationProvider {
  if (!config.apiKey || !config.region) {
    throw new ProviderConfigurationError(
      "BytePlus API key and region are required",
    );
  }

  const fetchClient = config.fetch ?? globalThis.fetch;
  const baseUrl = (
    config.modelArkBaseUrl ?? `https://ark.${config.region}.byteplus.com/api/v3`
  ).replace(/\/+$/, "");

  const logger = createLogger({
    service: "byteplus-adapter",
    version: "0.1.0",
  });

  return {
    name: "byteplus",

    async listModels(): Promise<readonly ProviderModelDescriptor[]> {
      return VERIFIED_BYTEPLUS_MODELS;
    },

    async submit(submission: MediaSubmission): Promise<ProviderJob> {
      logger.info("Submitting BytePlus media generation job", {
        modelId: submission.modelId,
        mediaKind: submission.mediaKind,
        idempotencyKey: submission.idempotencyKey,
      });

      switch (submission.mediaKind) {
        case "image": {
          const parseResult = bytePlusImageInputSchema.safeParse(
            submission.input,
          );
          if (!parseResult.success) {
            throw new ProviderRequestError(
              `Invalid image generation input: ${parseResult.error.message}`,
              false,
            );
          }

          const input = parseResult.data;
          const url = `${baseUrl}/images/generations`;
          const response = await safeFetch(fetchClient, url, {
            method: "POST",
            headers: {
              authorization: `Bearer ${config.apiKey}`,
              "content-type": "application/json",
              "x-idempotency-key": submission.idempotencyKey,
            },
            body: JSON.stringify({
              model: submission.modelId,
              prompt: input.prompt,
              response_format: "url",
              size: mapAspectRatioToSize(input.aspectRatio),
              steps: input.steps ?? 30,
            }),
          });

          if (!response.ok) {
            const body = await response.text().catch(() => "");
            throw mapBytePlusError(response.status, body);
          }

          const rawData = (await response.json()) as {
            id?: string;
            data?: Array<{ url: string }>;
            usage?: Record<string, unknown>;
          };

          const outputUrls = rawData.data?.map((item) => item.url) ?? [];
          const providerRequestId =
            rawData.id ?? `img-${submission.idempotencyKey}`;

          logger.info("BytePlus image generation succeeded", {
            providerRequestId,
            modelId: submission.modelId,
            status: "succeeded",
          });

          return {
            providerRequestId,
            status: "succeeded",
            outputUrls,
            rawUsage: rawData.usage,
          };
        }

        case "video": {
          const parseResult = bytePlusVideoInputSchema.safeParse(
            submission.input,
          );
          if (!parseResult.success) {
            throw new ProviderRequestError(
              `Invalid video generation input: ${parseResult.error.message}`,
              false,
            );
          }

          const input = parseResult.data;
          const url = `${baseUrl}/contents/generations/tasks`;
          const response = await safeFetch(fetchClient, url, {
            method: "POST",
            headers: {
              authorization: `Bearer ${config.apiKey}`,
              "content-type": "application/json",
              "x-idempotency-key": submission.idempotencyKey,
            },
            body: JSON.stringify({
              model: submission.modelId,
              prompt: input.prompt,
              aspect_ratio: input.aspectRatio ?? "16:9",
              duration: input.durationSeconds ?? 5,
            }),
          });

          if (!response.ok) {
            const body = await response.text().catch(() => "");
            throw mapBytePlusError(response.status, body);
          }

          const rawData = (await response.json()) as {
            id: string;
            status?: string;
          };

          const status = mapTaskStatus(rawData.status ?? "QUEUED");
          logger.info("BytePlus video generation task submitted", {
            providerRequestId: rawData.id,
            modelId: submission.modelId,
            status,
          });

          return {
            providerRequestId: rawData.id,
            status,
          };
        }

        case "voice": {
          const parseResult = bytePlusVoiceInputSchema.safeParse(
            submission.input,
          );
          if (!parseResult.success) {
            throw new ProviderRequestError(
              `Invalid voice generation input: ${parseResult.error.message}`,
              false,
            );
          }

          const input = parseResult.data;
          const url = `${baseUrl}/audio/speech`;
          const response = await safeFetch(fetchClient, url, {
            method: "POST",
            headers: {
              authorization: `Bearer ${config.speechAccessToken ?? config.apiKey}`,
              "content-type": "application/json",
              "x-idempotency-key": submission.idempotencyKey,
            },
            body: JSON.stringify({
              model: submission.modelId,
              input: input.text ?? input.prompt,
              voice: input.voiceType ?? "default",
              language: input.language ?? "en",
              response_format: "url",
            }),
          });

          if (!response.ok) {
            const body = await response.text().catch(() => "");
            throw mapBytePlusError(response.status, body);
          }

          const rawData = (await response.json()) as {
            id?: string;
            data?: Array<{ url: string }>;
            output_url?: string;
            audio_url?: string;
          };

          const outputUrls = rawData.data
            ? rawData.data.map((d) => d.url)
            : rawData.output_url
              ? [rawData.output_url]
              : rawData.audio_url
                ? [rawData.audio_url]
                : [];

          const providerRequestId =
            rawData.id ?? `tts-${submission.idempotencyKey}`;

          logger.info("BytePlus voice generation succeeded", {
            providerRequestId,
            modelId: submission.modelId,
            status: "succeeded",
          });

          return {
            providerRequestId,
            status: "succeeded",
            outputUrls,
          };
        }

        default: {
          const exhaustiveCheck: never = submission.mediaKind;
          throw new ProviderRequestError(
            `Unsupported media kind: ${String(exhaustiveCheck)}`,
            false,
          );
        }
      }
    },

    async getJob(providerRequestId: string): Promise<ProviderJob> {
      logger.debug("Polling BytePlus task status", { providerRequestId });

      const url = `${baseUrl}/contents/generations/tasks/${providerRequestId}`;
      const response = await safeFetch(fetchClient, url, {
        method: "GET",
        headers: {
          authorization: `Bearer ${config.apiKey}`,
        },
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw mapBytePlusError(response.status, body);
      }

      const rawData = (await response.json()) as {
        id: string;
        status: string;
        content?: { video_url?: string };
        data?: Array<{ url?: string }>;
        error?: { code?: string; message?: string };
        usage?: Record<string, unknown>;
      };

      const status = mapTaskStatus(rawData.status);
      const outputUrls: string[] = [];
      if (rawData.content?.video_url) {
        outputUrls.push(rawData.content.video_url);
      } else if (rawData.data) {
        for (const item of rawData.data) {
          if (item.url) outputUrls.push(item.url);
        }
      }

      logger.info("BytePlus task polled", {
        providerRequestId: rawData.id,
        status,
      });

      return {
        providerRequestId: rawData.id,
        status,
        outputUrls: outputUrls.length > 0 ? outputUrls : undefined,
        rawUsage: rawData.usage,
        errorCode:
          status === "failed"
            ? (rawData.error?.code ?? "TASK_FAILED")
            : undefined,
      };
    },

    async cancel(providerRequestId: string): Promise<void> {
      logger.info("Cancelling BytePlus task", { providerRequestId });

      const url = `${baseUrl}/contents/generations/tasks/${providerRequestId}/cancel`;
      const response = await safeFetch(fetchClient, url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.apiKey}`,
        },
      });

      if (!response.ok && response.status !== 404) {
        const body = await response.text().catch(() => "");
        throw mapBytePlusError(response.status, body);
      }
    },
  };
}
