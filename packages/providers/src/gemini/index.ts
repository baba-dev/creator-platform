import { createLogger } from "@aiwa/observability";
import { z } from "zod";
import {
  ProviderConfigurationError,
  ProviderRequestError,
  type ProviderModelDescriptor,
  type ReasoningProvider,
  type ReasoningRequest,
  type ReasoningResult,
  type TextChatRequest,
  type TextChatResult,
} from "../index";
import { executeSafeFetch, sharedReadResponseText } from "../http";

export interface GeminiAdapterConfig {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly defaultModel?: string;
  readonly requestTimeoutMs?: number;
  readonly idleTimeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
}

const DEFAULT_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai";
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

const geminiErrorSchema = z.object({
  error: z
    .object({
      message: z.string().optional(),
      code: z.union([z.string(), z.number()]).optional(),
      status: z.string().optional(),
    })
    .optional(),
});

function normalizedBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProviderConfigurationError("Gemini base URL must be a valid URL");
  }

  const localDevelopment =
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname) &&
    url.protocol === "http:";
  if (url.protocol !== "https:" && !localDevelopment) {
    throw new ProviderConfigurationError(
      "Gemini base URL must use HTTPS outside localhost",
    );
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function mapGeminiError(
  status: number,
  bodyText: string,
): ProviderRequestError {
  let code: string | number | undefined;
  try {
    const parsed = geminiErrorSchema.safeParse(JSON.parse(bodyText));
    if (parsed.success) {
      code = parsed.data.error?.status ?? parsed.data.error?.code;
    }
  } catch {
    // Upstream details intentionally not reflected.
  }

  const safeCode = code === undefined ? undefined : String(code);
  const retryable =
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    (status >= 500 && status <= 599) ||
    (safeCode !== undefined &&
      /RESOURCE_EXHAUSTED|rate.?limit|throttl|unavailable/i.test(safeCode));

  return new ProviderRequestError(
    `Gemini request failed with status ${status}`,
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
    providerName: "Gemini",
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
    providerName: "Gemini",
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
  throw mapGeminiError(response.status, body);
}

function parseStructuredContent(content: string): unknown {
  const trimmed = content.trim();

  const candidates = [trimmed];
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed)?.[1];
  if (fenced) candidates.push(fenced.trim());

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Continue parsing next candidate
    }
  }

  throw new ProviderRequestError(
    "Gemini reasoning result was not valid JSON",
    false,
    { code: "INVALID_PROVIDER_RESPONSE", stage: "parsing" },
  );
}

export interface GeminiProvider extends ReasoningProvider {
  chat(input: TextChatRequest): Promise<TextChatResult>;
  embed(
    texts: readonly string[],
    modelId?: string,
  ): Promise<readonly number[][]>;
}

export function createGeminiProvider(
  config: GeminiAdapterConfig,
): GeminiProvider {
  if (!config.apiKey) {
    throw new ProviderConfigurationError("Gemini API key is required");
  }

  const fetchClient = config.fetch ?? globalThis.fetch;
  if (!fetchClient) {
    throw new ProviderConfigurationError("A fetch implementation is required");
  }

  const baseUrl = normalizedBaseUrl(config.baseUrl ?? DEFAULT_BASE_URL);
  const defaultModel = config.defaultModel ?? "gemini-3.8-flash";
  const timeoutMs = config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const idleTimeoutMs = config.idleTimeoutMs;
  const logger = createLogger({
    service: "gemini-adapter",
    version: "0.1.0",
  });

  return {
    name: "gemini",

    async complete(input: ReasoningRequest): Promise<ReasoningResult> {
      const modelId = input.modelId || defaultModel;
      logger.info("Submitting Gemini reasoning request", { modelId });

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
        throw new ProviderRequestError("Gemini returned invalid JSON", false, {
          cause: error,
          code: "INVALID_PROVIDER_RESPONSE",
          stage: "parsing",
        });
      }

      const parsed = chatCompletionResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ProviderRequestError(
          "Gemini returned an invalid response shape",
          false,
          { code: "INVALID_PROVIDER_RESPONSE", stage: "parsing" },
        );
      }

      const messageContent = parsed.data.choices[0]?.message.content;
      if (!messageContent) {
        throw new ProviderRequestError(
          "Gemini reasoning returned empty content",
          false,
          { code: "INVALID_PROVIDER_RESPONSE", stage: "parsing" },
        );
      }

      const contentJson = parseStructuredContent(messageContent);

      logger.info("Gemini reasoning request succeeded", {
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
      logger.info("Submitting Gemini text chat request", { modelId });

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
        throw new ProviderRequestError("Gemini returned invalid JSON", false, {
          cause: error,
          code: "INVALID_PROVIDER_RESPONSE",
          stage: "parsing",
        });
      }

      const parsed = chatCompletionResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ProviderRequestError(
          "Gemini returned an invalid response shape",
          false,
          { code: "INVALID_PROVIDER_RESPONSE", stage: "parsing" },
        );
      }

      const messageContent = parsed.data.choices[0]?.message.content ?? "";

      logger.info("Gemini text chat request succeeded", {
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

    async embed(
      texts: readonly string[],
      modelId = "gemini-embedding-001",
    ): Promise<readonly number[][]> {
      logger.info("Submitting Gemini embedding request", {
        modelId,
        count: texts.length,
      });

      const response = await safeFetch(
        fetchClient,
        `${baseUrl}/embeddings`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: modelId,
            input: texts,
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

      const parsed = z
        .object({
          data: z.array(z.object({ embedding: z.array(z.number()) })),
        })
        .safeParse(JSON.parse(responseText));

      if (!parsed.success) {
        throw new ProviderRequestError(
          "Gemini returned invalid embedding response",
          false,
          { code: "INVALID_PROVIDER_RESPONSE", stage: "parsing" },
        );
      }

      return parsed.data.data.map((item) => item.embedding);
    },
  };
}

export const VERIFIED_GEMINI_MODELS: readonly ProviderModelDescriptor[] = [
  {
    id: "gemini-3.5-flash-lite",
    provider: "gemini",
    displayName: "Gemini 3.5 Flash-Lite",
    description:
      "Stable low-latency Gemini model for high-throughput chat and creative drafting.",
    mediaKind: "text",
    capabilities: {
      contextWindow: 1048576,
      chat: true,
      characterChat: true,
      scriptwriting: true,
      fast: true,
    },
  },
  {
    id: "gemini-3.8-flash",
    provider: "gemini",
    displayName: "Gemini 3.8 Flash",
    description:
      "Stable production Gemini model for long-context reasoning, creative direction, and prompt enhancement.",
    mediaKind: "reasoning",
    capabilities: {
      contextWindow: 1048576,
      reasoning: true,
      creativeDirector: true,
      storyPlanning: true,
      "task:prompt-enhancement": true,
    },
  },
];
