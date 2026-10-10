import { createLogger } from "@aiwa/observability";
import { z } from "zod";
import {
  ProviderConfigurationError,
  ProviderRequestError,
  type ReasoningProvider,
  type ReasoningRequest,
  type ReasoningResult,
  type TextChatRequest,
  type TextChatResult,
} from "../index";
import { executeSafeFetch, sharedReadResponseText } from "../http";
import { isNvidiaChatModel } from "./models";

export interface NvidiaAdapterConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly defaultModel: string;
  readonly requestTimeoutMs?: number;
  readonly idleTimeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_ERROR_BODY_BYTES = 32 * 1024;
const MAX_JSON_RESPONSE_BYTES = 1024 * 1024;

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

const nvidiaErrorSchema = z.object({
  error: z
    .object({
      code: z.union([z.string(), z.number()]).optional(),
    })
    .optional(),
});

function normalizedBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProviderConfigurationError("NVIDIA base URL must be a valid URL");
  }

  const localDevelopment =
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname) &&
    url.protocol === "http:";
  if (url.protocol !== "https:" && !localDevelopment) {
    throw new ProviderConfigurationError(
      "NVIDIA base URL must use HTTPS outside localhost",
    );
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function mapNvidiaError(
  status: number,
  bodyText: string,
): ProviderRequestError {
  let code: string | number | undefined;
  try {
    const parsed = nvidiaErrorSchema.safeParse(JSON.parse(bodyText));
    if (parsed.success) code = parsed.data.error?.code;
  } catch {
    // Provider bodies are intentionally not reflected in application errors.
  }

  const safeCode = code === undefined ? undefined : String(code);
  const retryable =
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    (status >= 500 && status <= 599) ||
    (safeCode !== undefined &&
      /rate.?limit|throttl|resource.?exhausted/i.test(safeCode));

  return new ProviderRequestError(
    `NVIDIA request failed with status ${status}`,
    retryable,
    { code: safeCode ?? `HTTP_${status}`, stage: "response_headers" },
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
    providerName: "NVIDIA",
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
    providerName: "NVIDIA",
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
      )
        throw error;
      return "";
    },
  );
  throw mapNvidiaError(response.status, body);
}

function parseStructuredContent(content: string): unknown {
  const trimmed = content.trim();

  const candidates = [trimmed];
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed)?.[1];
  if (fenced) candidates.push(fenced);

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace)
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next conservative extraction form.
    }
  }

  throw new ProviderRequestError(
    "NVIDIA reasoning result was not valid JSON",
    false,
    { code: "INVALID_PROVIDER_RESPONSE", stage: "parsing" },
  );
}

export interface NvidiaProvider extends ReasoningProvider {
  chat(input: TextChatRequest): Promise<TextChatResult>;
}

export function createNvidiaProvider(
  config: NvidiaAdapterConfig,
): NvidiaProvider {
  if (!config.apiKey || !config.baseUrl || !config.defaultModel) {
    throw new ProviderConfigurationError(
      "NVIDIA API key, base URL, and model are required",
    );
  }

  const fetchClient = config.fetch ?? globalThis.fetch;
  if (!fetchClient)
    throw new ProviderConfigurationError("A fetch implementation is required");

  const baseUrl = normalizedBaseUrl(config.baseUrl);
  const timeoutMs = config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const idleTimeoutMs = config.idleTimeoutMs;
  const logger = createLogger({
    service: "nvidia-adapter",
    version: "0.1.0",
  });

  return {
    name: "nvidia",
    async complete(input: ReasoningRequest): Promise<ReasoningResult> {
      const modelId = input.modelId || config.defaultModel;
      logger.info("Submitting NVIDIA reasoning request", { modelId });

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
            ...(modelId === "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
              ? { top_k: 1, chat_template_kwargs: { enable_thinking: false } }
              : {}),
            max_tokens:
              modelId === "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
                ? 1024
                : 2048,
            stream: false,
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
        throw new ProviderRequestError("NVIDIA returned invalid JSON", false, {
          cause: error,
          code: "INVALID_PROVIDER_RESPONSE",
          stage: "parsing",
        });
      }

      const parsed = chatCompletionResponseSchema.safeParse(data);
      if (!parsed.success)
        throw new ProviderRequestError(
          "NVIDIA returned an invalid response shape",
          false,
          { code: "INVALID_PROVIDER_RESPONSE", stage: "parsing" },
        );

      const messageContent = parsed.data.choices[0]?.message.content;
      if (!messageContent)
        throw new ProviderRequestError(
          "NVIDIA reasoning returned empty content",
          false,
          { code: "INVALID_PROVIDER_RESPONSE", stage: "parsing" },
        );

      const contentJson = parseStructuredContent(messageContent);

      logger.info("NVIDIA reasoning request succeeded", {
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
      const modelId = input.modelId || config.defaultModel;
      if (!isNvidiaChatModel(modelId)) {
        throw new ProviderConfigurationError(
          "NVIDIA text chat model is not in the verified integration catalog",
        );
      }
      if (
        !Number.isSafeInteger(input.maxTokens ?? 2048) ||
        (input.maxTokens ?? 2048) < 1 ||
        (input.maxTokens ?? 2048) > 8192 ||
        !Number.isFinite(input.temperature ?? 0.7) ||
        (input.temperature ?? 0.7) < 0 ||
        (input.temperature ?? 0.7) > 2 ||
        input.messages.length === 0 ||
        input.messages.length > 50 ||
        input.messages.some(
          (message) =>
            !["system", "user", "assistant"].includes(message.role) ||
            !message.content.trim() ||
            message.content.length > 8000,
        )
      ) {
        throw new ProviderRequestError("Invalid NVIDIA chat request", false, {
          code: "INVALID_REQUEST_PAYLOAD",
        });
      }

      // NIM endpoints do not share a universal JSON mode, top_k or thinking
      // parameter. Keep the compatible core request and validate JSON locally.
      const messages =
        input.responseFormat === "json_object"
          ? [
              {
                role: "system" as const,
                content: "Return only one valid JSON object, without markdown.",
              },
              ...input.messages,
            ]
          : input.messages;

      logger.info("Submitting NVIDIA text chat request", { modelId });
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
            messages,
            temperature: Math.min(input.temperature ?? 0.7, 1),
            max_tokens: input.maxTokens ?? 2048,
            stream: false,
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
      } catch {
        throw new ProviderRequestError("NVIDIA returned invalid JSON", false, {
          code: "INVALID_PROVIDER_RESPONSE",
          stage: "parsing",
        });
      }
      const parsed = chatCompletionResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ProviderRequestError(
          "NVIDIA returned an invalid chat response shape",
          false,
          { code: "INVALID_PROVIDER_RESPONSE", stage: "parsing" },
        );
      }
      // Some reasoning NIMs include analysis in a leading <think> element;
      // that must not leak into customer-visible assistant dialogue.
      const content = (parsed.data.choices[0]?.message.content ?? "")
        .replace(/^\\s*<think>[\\s\\S]*?<\\/think>\\s*/i, "")
        .trim();
      if (!content) {
        throw new ProviderRequestError("NVIDIA returned no chat content", false, {
          code: "INVALID_PROVIDER_RESPONSE",
          stage: "parsing",
        });
      }
      if (input.responseFormat === "json_object") {
        try {
          const value: unknown = JSON.parse(content);
          if (!value || Array.isArray(value) || typeof value !== "object")
            throw new Error("Expected JSON object");
        } catch {
          throw new ProviderRequestError(
            "NVIDIA did not return the requested JSON object",
            false,
            { code: "INVALID_PROVIDER_RESPONSE", stage: "parsing" },
          );
        }
      }
      const usage = parsed.data.usage;
      const completeUsage =
        usage?.prompt_tokens !== undefined &&
        usage.completion_tokens !== undefined &&
        usage.total_tokens !== undefined;
      logger.info("NVIDIA text chat request succeeded", {
        modelId,
        providerRequestId: parsed.data.id,
      });
      return {
        providerRequestId: parsed.data.id,
        content,
        usage: completeUsage
          ? {
              promptTokens: usage.prompt_tokens!,
              completionTokens: usage.completion_tokens!,
              totalTokens: usage.total_tokens!,
            }
          : undefined,
      };
    },
  };
}
