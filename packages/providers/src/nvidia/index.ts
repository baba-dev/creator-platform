import { createLogger } from "@aiwa/observability";
import { z } from "zod";
import {
  ProviderConfigurationError,
  ProviderRequestError,
  type ReasoningProvider,
  type ReasoningRequest,
  type ReasoningResult,
} from "../index";

export interface NvidiaAdapterConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly defaultModel: string;
  readonly requestTimeoutMs?: number;
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
    { code: safeCode ?? `HTTP_${status}` },
  );
}

async function safeFetch(
  fetchFn: typeof globalThis.fetch,
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...options, signal: controller.signal });
  } catch (error) {
    // A lost response has an unknown provider outcome. Do not automatically
    // replay it because the hosted chat API does not expose request
    // reconciliation by client idempotency key.
    throw new ProviderRequestError("NVIDIA network request failed", false, {
      cause: error,
      code: controller.signal.aborted
        ? "REQUEST_OUTCOME_UNKNOWN"
        : "NETWORK_OUTCOME_UNKNOWN",
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readResponseText(
  response: Response,
  maximumBytes: number,
): Promise<string> {
  if (!response.body) {
    const value = await response.text();
    if (new TextEncoder().encode(value).byteLength > maximumBytes)
      throw new ProviderRequestError(
        "NVIDIA response exceeded size limit",
        true,
        { code: "RESPONSE_TOO_LARGE" },
      );
    return value;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let value = "";

  try {
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      size += chunk.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw new ProviderRequestError(
          "NVIDIA response exceeded size limit",
          true,
          { code: "RESPONSE_TOO_LARGE" },
        );
      }
      value += decoder.decode(chunk, { stream: true });
    }
    value += decoder.decode();
    return value;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError("NVIDIA response read failed", true, {
      cause: error,
      code: "NETWORK_ERROR",
    });
  } finally {
    reader.releaseLock();
  }
}

async function assertSuccessfulResponse(response: Response): Promise<void> {
  if (response.ok) return;
  const body = await readResponseText(response, MAX_ERROR_BODY_BYTES).catch(
    () => "",
  );
  throw mapNvidiaError(response.status, body);
}

function parseStructuredContent(content: string): unknown {
  const trimmed = content.trim();

  const candidates = [trimmed];
  const fenced = /\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`/i.exec(trimmed)?.[1];
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
    true,
    { code: "INVALID_PROVIDER_RESPONSE" },
  );
}

export function createNvidiaProvider(
  config: NvidiaAdapterConfig,
): ReasoningProvider {
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
            top_k: 1,
            max_tokens: 1024,
            stream: false,
            chat_template_kwargs: { enable_thinking: false },
          }),
        },
        timeoutMs,
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
        throw new ProviderRequestError("NVIDIA returned invalid JSON", true, {
          cause: error,
          code: "INVALID_PROVIDER_RESPONSE",
        });
      }

      const parsed = chatCompletionResponseSchema.safeParse(data);
      if (!parsed.success)
        throw new ProviderRequestError(
          "NVIDIA returned an invalid response shape",
          true,
          { code: "INVALID_PROVIDER_RESPONSE" },
        );

      const messageContent = parsed.data.choices[0]?.message.content;
      if (!messageContent)
        throw new ProviderRequestError(
          "NVIDIA reasoning returned empty content",
          true,
          { code: "INVALID_PROVIDER_RESPONSE" },
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
  };
}
