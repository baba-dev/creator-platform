import { createLogger } from "@aiwa/observability";
import { z } from "zod";
import {
  ProviderConfigurationError,
  ProviderRequestError,
  type AudioTranscriptionRequest,
  type AudioTranscriptionResult,
  type AudioTranscriptionSegment,
  type ProviderModelDescriptor,
  type ReasoningProvider,
  type ReasoningRequest,
  type ReasoningResult,
  type TextChatRequest,
  type TextChatResult,
} from "../index";
import { executeSafeFetch, sharedReadResponseText } from "../http";

export interface GroqAdapterConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly defaultModel?: string;
  readonly requestTimeoutMs?: number;
  readonly idleTimeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
}

const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_ERROR_BODY_BYTES = 32 * 1024;
const MAX_JSON_RESPONSE_BYTES = 2 * 1024 * 1024;

const chatCompletionResponseSchema = z.object({
  id: z.string().optional(),
  choices: z
    .array(
      z.object({
        message: z.object({
          role: z.string(),
          content: z.string().nullable(),
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
    })
    .optional(),
});

const groqErrorSchema = z.object({
  error: z
    .object({
      message: z.string().optional(),
      type: z.string().optional(),
      code: z.union([z.string(), z.number()]).optional(),
    })
    .optional(),
});

const groqTranscriptionResponseSchema = z.object({
  text: z.string(),
  segments: z
    .array(
      z.object({
        id: z.number(),
        start: z.number(),
        end: z.number(),
        text: z.string(),
      }),
    )
    .optional(),
  duration: z.number().optional(),
  language: z.string().optional(),
});

function normalizedBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProviderConfigurationError("Groq base URL must be a valid URL");
  }

  const localDevelopment =
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname) &&
    url.protocol === "http:";
  if (url.protocol !== "https:" && !localDevelopment) {
    throw new ProviderConfigurationError(
      "Groq base URL must use HTTPS outside localhost",
    );
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function mapGroqError(
  status: number,
  bodyText: string,
): ProviderRequestError {
  let code: string | number | undefined;
  try {
    const parsed = groqErrorSchema.safeParse(JSON.parse(bodyText));
    if (parsed.success) {
      code = parsed.data.error?.code ?? parsed.data.error?.type;
    }
  } catch {
    // Upstream provider messages intentionally not reflected in application errors.
  }

  const safeCode = code === undefined ? undefined : String(code);
  const retryable =
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    (status >= 500 && status <= 599) ||
    (safeCode !== undefined &&
      /rate.?limit|throttl|resource.?exhausted|server_error/i.test(safeCode));

  return new ProviderRequestError(
    `Groq request failed with status ${status}`,
    retryable,
    { code: safeCode ?? `HTTP_${status}`, stage: "response_headers" },
  );
}

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
    providerName: "Groq",
    onAbortCode: "REQUEST_OUTCOME_UNKNOWN",
    onAbortRetryable: false,
    onNetworkErrorCode: "NETWORK_OUTCOME_UNKNOWN",
    stage: "dispatch",
  });
}

export async function readResponseText(
  response: Response,
  maximumBytes: number,
): Promise<string> {
  return sharedReadResponseText(response, maximumBytes, {
    providerName: "Groq",
    onAbortCode: "REQUEST_OUTCOME_UNKNOWN",
    onAbortRetryable: false,
    onNetworkErrorCode: "BODY_READ_OUTCOME_UNKNOWN",
    onNetworkErrorRetryable: false,
    onResponseTooLargeRetryable: false,
    stage: "response_body",
  });
}

async function assertSuccessfulResponse(response: Response): Promise<void> {
  if (response.ok) return;
  const body = await readResponseText(response, MAX_ERROR_BODY_BYTES).catch(
    (error: unknown) => {
      if (
        error instanceof ProviderRequestError &&
        error.code === "REQUEST_OUTCOME_UNKNOWN"
      ) {
        throw error;
      }
      return "";
    },
  );
  throw mapGroqError(response.status, body);
}

function parseStructuredContent(content: string): unknown {
  // Strip DeepSeek-R1 <think>...</think> if present
  const cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  const candidates = [cleaned];
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(cleaned)?.[1];
  if (fenced) candidates.push(fenced.trim());

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try next format
    }
  }

  throw new ProviderRequestError(
    "Groq reasoning result was not valid JSON",
    false,
    { code: "INVALID_PROVIDER_RESPONSE", stage: "parsing" },
  );
}

function formatSecondsToSrtTime(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function formatSecondsToVttTime(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

export function generateSrtFromSegments(
  segments: readonly AudioTranscriptionSegment[],
): string {
  return segments
    .map(
      (seg, idx) =>
        `${idx + 1}\n${formatSecondsToSrtTime(seg.start)} --> ${formatSecondsToSrtTime(seg.end)}\n${seg.text.trim()}\n`,
    )
    .join("\n");
}

export function generateVttFromSegments(
  segments: readonly AudioTranscriptionSegment[],
): string {
  const lines = ["WEBVTT\n"];
  for (const seg of segments) {
    lines.push(
      `${formatSecondsToVttTime(seg.start)} --> ${formatSecondsToVttTime(seg.end)}\n${seg.text.trim()}\n`,
    );
  }
  return lines.join("\n");
}

export interface GroqProvider extends ReasoningProvider {
  chat(input: TextChatRequest): Promise<TextChatResult>;
  transcribe(
    input: AudioTranscriptionRequest,
  ): Promise<AudioTranscriptionResult>;
}

export function createGroqProvider(config: GroqAdapterConfig): GroqProvider {
  if (!config.apiKey || !config.baseUrl) {
    throw new ProviderConfigurationError(
      "Groq API key and base URL are required",
    );
  }

  const fetchClient = config.fetch ?? globalThis.fetch;
  if (!fetchClient) {
    throw new ProviderConfigurationError("A fetch implementation is required");
  }

  const baseUrl = normalizedBaseUrl(config.baseUrl);
  const defaultModel = config.defaultModel ?? "openai/gpt-oss-120b";
  const timeoutMs = config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const idleTimeoutMs = config.idleTimeoutMs;
  const logger = createLogger({
    service: "groq-adapter",
    version: "0.1.0",
  });

  return {
    name: "groq",

    async complete(input: ReasoningRequest): Promise<ReasoningResult> {
      const modelId = input.modelId || defaultModel;
      logger.info("Submitting Groq reasoning request", { modelId });

      const response = await safeFetch(
        fetchClient,
        `${baseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: modelId,
            messages: [
              { role: "system", content: input.systemPrompt },
              { role: "user", content: input.userPrompt },
            ],
            temperature: 0.2,
            max_tokens: 2048,
            stream: false,
            response_format: { type: "json_object" },
          }),
        },
        timeoutMs,
        idleTimeoutMs,
      );

      await assertSuccessfulResponse(response);
      const responseText = await readResponseText(
        response,
        MAX_JSON_RESPONSE_BYTES,
      );

      let data: unknown;
      try {
        data = JSON.parse(responseText);
      } catch (error) {
        throw new ProviderRequestError("Groq returned invalid JSON", false, {
          cause: error,
          code: "INVALID_PROVIDER_RESPONSE",
          stage: "parsing",
        });
      }

      const parsed = chatCompletionResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ProviderRequestError(
          "Groq returned an invalid response shape",
          false,
          { code: "INVALID_PROVIDER_RESPONSE", stage: "parsing" },
        );
      }

      const messageContent = parsed.data.choices[0]?.message.content;
      if (!messageContent) {
        throw new ProviderRequestError(
          "Groq reasoning returned empty content",
          false,
          { code: "INVALID_PROVIDER_RESPONSE", stage: "parsing" },
        );
      }

      const contentJson = parseStructuredContent(messageContent);

      logger.info("Groq reasoning request succeeded", {
        modelId,
        providerRequestId: parsed.data.id,
      });

      return {
        providerRequestId: parsed.data.id,
        content: contentJson,
        inputTokens: parsed.data.usage?.prompt_tokens,
        outputTokens: parsed.data.usage?.completion_tokens,
      };
    },

    async chat(input: TextChatRequest): Promise<TextChatResult> {
      const modelId = input.modelId || defaultModel;
      logger.info("Submitting Groq text chat request", { modelId });

      const requestBody: Record<string, unknown> = {
        model: modelId,
        messages: input.messages,
        temperature: input.temperature ?? 0.7,
        stream: false,
      };

      if (input.maxTokens !== undefined) {
        requestBody.max_tokens = input.maxTokens;
      }

      if (input.responseFormat === "json_object") {
        requestBody.response_format = { type: "json_object" };
      }

      const response = await safeFetch(
        fetchClient,
        `${baseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        },
        timeoutMs,
        idleTimeoutMs,
      );

      await assertSuccessfulResponse(response);
      const responseText = await readResponseText(
        response,
        MAX_JSON_RESPONSE_BYTES,
      );

      let data: unknown;
      try {
        data = JSON.parse(responseText);
      } catch (error) {
        throw new ProviderRequestError("Groq returned invalid JSON", false, {
          cause: error,
          code: "INVALID_PROVIDER_RESPONSE",
          stage: "parsing",
        });
      }

      const parsed = chatCompletionResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ProviderRequestError(
          "Groq returned an invalid response shape",
          false,
          { code: "INVALID_PROVIDER_RESPONSE", stage: "parsing" },
        );
      }

      const messageContent = parsed.data.choices[0]?.message.content ?? "";

      logger.info("Groq text chat request succeeded", {
        modelId,
        providerRequestId: parsed.data.id,
      });

      return {
        providerRequestId: parsed.data.id,
        content: messageContent,
        usage: parsed.data.usage
          ? {
              promptTokens: parsed.data.usage.prompt_tokens ?? 0,
              completionTokens: parsed.data.usage.completion_tokens ?? 0,
              totalTokens: parsed.data.usage.total_tokens ?? 0,
            }
          : undefined,
      };
    },

    async transcribe(
      input: AudioTranscriptionRequest,
    ): Promise<AudioTranscriptionResult> {
      const modelId = input.modelId || "whisper-large-v3-turbo";
      logger.info("Submitting Groq audio transcription request", { modelId });

      const formData = new FormData();
      const blob = new Blob([input.audioBytes as unknown as BlobPart], {
        type: input.mimeType || "audio/mpeg",
      });
      formData.append("file", blob, input.filename || "audio.mp3");
      formData.append("model", modelId);
      formData.append("response_format", "verbose_json");

      if (input.language) {
        formData.append("language", input.language);
      }
      if (input.prompt) {
        formData.append("prompt", input.prompt);
      }
      if (input.temperature !== undefined) {
        formData.append("temperature", String(input.temperature));
      }

      const response = await safeFetch(
        fetchClient,
        `${baseUrl}/audio/transcriptions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            Accept: "application/json",
          },
          body: formData,
        },
        timeoutMs * 2,
        idleTimeoutMs,
      );

      await assertSuccessfulResponse(response);
      const responseText = await readResponseText(
        response,
        MAX_JSON_RESPONSE_BYTES * 2,
      );

      let data: unknown;
      try {
        data = JSON.parse(responseText);
      } catch (error) {
        throw new ProviderRequestError("Groq returned invalid JSON", false, {
          cause: error,
          code: "INVALID_PROVIDER_RESPONSE",
          stage: "parsing",
        });
      }

      const parsed = groqTranscriptionResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ProviderRequestError(
          "Groq returned an invalid transcription response shape",
          false,
          { code: "INVALID_PROVIDER_RESPONSE", stage: "parsing" },
        );
      }

      const segments = parsed.data.segments;
      const srt = segments ? generateSrtFromSegments(segments) : undefined;
      const vtt = segments ? generateVttFromSegments(segments) : undefined;

      logger.info("Groq audio transcription succeeded", {
        modelId,
        segmentsCount: segments?.length ?? 0,
      });

      return {
        text: parsed.data.text,
        segments,
        srt,
        vtt,
        durationSeconds: parsed.data.duration,
        language: parsed.data.language,
      };
    },
  };
}

export const VERIFIED_GROQ_MODELS: readonly ProviderModelDescriptor[] = [
  {
    id: "openai/gpt-oss-20b",
    provider: "groq",
    displayName: "GPT-OSS 20B (Groq)",
    description:
      "Production Groq text model for low-latency chat, character dialogue, and creative drafting.",
    mediaKind: "text",
    capabilities: {
      contextWindow: 131072,
      chat: true,
      characterChat: true,
      scriptwriting: true,
      fast: true,
    },
  },
  {
    id: "openai/gpt-oss-120b",
    provider: "groq",
    displayName: "GPT-OSS 120B (Groq)",
    description:
      "Production Groq reasoning model for prompt enhancement, creative planning, and high-depth synthesis.",
    mediaKind: "reasoning",
    capabilities: {
      contextWindow: 131072,
      reasoning: true,
      creativeDirector: true,
      storyPlanning: true,
      "task:prompt-enhancement": true,
    },
  },
  {
    id: "whisper-large-v3-turbo",
    provider: "groq",
    displayName: "Whisper Large v3 Turbo (Groq)",
    description:
      "Fast multilingual speech transcription for captions and subtitle workflows.",
    mediaKind: "voice",
    capabilities: {
      transcription: true,
      subtitles: true,
      fast: true,
    },
  },
];
