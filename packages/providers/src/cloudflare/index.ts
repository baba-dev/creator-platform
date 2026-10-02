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

export interface CloudflareAdapterConfig {
  readonly apiToken: string;
  readonly accountId: string;
  readonly baseUrl?: string;
  readonly defaultModel?: string;
  readonly requestTimeoutMs?: number;
  readonly idleTimeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
}

const DEFAULT_BASE_URL = "https://api.cloudflare.com/client/v4";
const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_ERROR_BODY_BYTES = 32 * 1024;
const MAX_JSON_RESPONSE_BYTES = 2 * 1024 * 1024;

const cloudflareAiResponseSchema = z.object({
  result: z.union([
    z.object({
      response: z.string().optional(),
    }),
    z.string(),
  ]),
  success: z.boolean(),
  errors: z
    .array(
      z.object({
        code: z.number().optional(),
        message: z.string().optional(),
      }),
    )
    .optional(),
});

const cloudflareErrorSchema = z.object({
  success: z.boolean(),
  errors: z
    .array(
      z.object({
        code: z.union([z.string(), z.number()]).optional(),
        message: z.string().optional(),
      }),
    )
    .default([]),
});

function normalizedBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProviderConfigurationError(
      "Cloudflare base URL must be a valid URL",
    );
  }

  const localDevelopment =
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname) &&
    url.protocol === "http:";
  if (url.protocol !== "https:" && !localDevelopment) {
    throw new ProviderConfigurationError(
      "Cloudflare base URL must use HTTPS outside localhost",
    );
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function mapCloudflareError(
  status: number,
  bodyText: string,
): ProviderRequestError {
  let code: string | number | undefined;
  try {
    const parsed = cloudflareErrorSchema.safeParse(JSON.parse(bodyText));
    if (parsed.success && parsed.data.errors[0]?.code !== undefined) {
      code = parsed.data.errors[0].code;
    }
  } catch {
    // Upstream details not reflected
  }

  const safeCode = code === undefined ? undefined : String(code);
  const retryable =
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    (status >= 500 && status <= 599) ||
    (safeCode !== undefined &&
      /rate.?limit|throttl|neurons|resource.?exhausted/i.test(safeCode));

  return new ProviderRequestError(
    `Cloudflare Workers AI request failed with status ${status}`,
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
    providerName: "Cloudflare",
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
    providerName: "Cloudflare",
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
  throw mapCloudflareError(response.status, body);
}

function parseStructuredContent(content: string): unknown {
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
      // Continue next candidate
    }
  }

  throw new ProviderRequestError(
    "Cloudflare reasoning result was not valid JSON",
    false,
    { code: "INVALID_PROVIDER_RESPONSE", stage: "parsing" },
  );
}

export interface CloudflareAiProvider extends ReasoningProvider {
  chat(input: TextChatRequest): Promise<TextChatResult>;
  embed(
    texts: readonly string[],
    modelId?: string,
  ): Promise<readonly number[][]>;
}

export function createCloudflareAiProvider(
  config: CloudflareAdapterConfig,
): CloudflareAiProvider {
  if (!config.apiToken || !config.accountId) {
    throw new ProviderConfigurationError(
      "Cloudflare API token and Account ID are required",
    );
  }

  const fetchClient = config.fetch ?? globalThis.fetch;
  if (!fetchClient) {
    throw new ProviderConfigurationError("A fetch implementation is required");
  }

  const baseUrl = normalizedBaseUrl(config.baseUrl ?? DEFAULT_BASE_URL);
  const defaultModel = config.defaultModel ?? "@cf/meta/llama-3.3-70b-instruct";
  const timeoutMs = config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const idleTimeoutMs = config.idleTimeoutMs;
  const logger = createLogger({
    service: "cloudflare-adapter",
    version: "0.1.0",
  });

  function getRunUrl(modelId: string): string {
    const safeModel = modelId.startsWith("@cf/") ? modelId : `@cf/${modelId}`;
    return `${baseUrl}/accounts/${config.accountId}/ai/run/${safeModel}`;
  }

  return {
    name: "cloudflare",

    async complete(input: ReasoningRequest): Promise<ReasoningResult> {
      const modelId = input.modelId || defaultModel;
      logger.info("Submitting Cloudflare reasoning request", { modelId });

      const url = getRunUrl(modelId);
      const response = await safeFetch(
        fetchClient,
        url,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiToken}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [
              { role: "system", content: input.systemPrompt },
              { role: "user", content: input.userPrompt },
            ],
            temperature: 0.2,
            max_tokens: 2048,
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
        throw new ProviderRequestError(
          "Cloudflare returned invalid JSON",
          false,
          {
            cause: error,
            code: "INVALID_PROVIDER_RESPONSE",
            stage: "parsing",
          },
        );
      }

      const parsed = cloudflareAiResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ProviderRequestError(
          "Cloudflare returned an invalid response shape",
          false,
          { code: "INVALID_PROVIDER_RESPONSE", stage: "parsing" },
        );
      }

      const rawContent =
        typeof parsed.data.result === "string"
          ? parsed.data.result
          : (parsed.data.result.response ?? "");

      if (!rawContent) {
        throw new ProviderRequestError(
          "Cloudflare reasoning returned empty content",
          false,
          { code: "INVALID_PROVIDER_RESPONSE", stage: "parsing" },
        );
      }

      const contentJson = parseStructuredContent(rawContent);

      logger.info("Cloudflare reasoning request succeeded", { modelId });

      return {
        content: contentJson,
      };
    },

    async chat(input: TextChatRequest): Promise<TextChatResult> {
      const modelId = input.modelId || defaultModel;
      logger.info("Submitting Cloudflare text chat request", { modelId });

      const url = getRunUrl(modelId);
      const response = await safeFetch(
        fetchClient,
        url,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiToken}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: input.messages,
            temperature: input.temperature ?? 0.7,
            max_tokens: input.maxTokens ?? 2048,
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
        throw new ProviderRequestError(
          "Cloudflare returned invalid JSON",
          false,
          {
            cause: error,
            code: "INVALID_PROVIDER_RESPONSE",
            stage: "parsing",
          },
        );
      }

      const parsed = cloudflareAiResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ProviderRequestError(
          "Cloudflare returned an invalid response shape",
          false,
          { code: "INVALID_PROVIDER_RESPONSE", stage: "parsing" },
        );
      }

      const content =
        typeof parsed.data.result === "string"
          ? parsed.data.result
          : (parsed.data.result.response ?? "");

      logger.info("Cloudflare text chat request succeeded", { modelId });

      return {
        content,
      };
    },

    async embed(
      texts: readonly string[],
      modelId = "@cf/baai/bge-large-en-v1.5",
    ): Promise<readonly number[][]> {
      logger.info("Submitting Cloudflare embedding request", {
        modelId,
        count: texts.length,
      });

      const url = getRunUrl(modelId);
      const response = await safeFetch(
        fetchClient,
        url,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiToken}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: texts }),
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
          result: z.object({
            data: z.array(z.array(z.number())),
          }),
        })
        .safeParse(JSON.parse(responseText));

      if (!parsed.success) {
        throw new ProviderRequestError(
          "Cloudflare returned invalid embedding response",
          false,
          { code: "INVALID_PROVIDER_RESPONSE", stage: "parsing" },
        );
      }

      return parsed.data.result.data;
    },
  };
}

export const VERIFIED_CLOUDFLARE_MODELS: readonly ProviderModelDescriptor[] = [
  {
    id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    provider: "cloudflare",
    displayName: "Llama 3.3 70B Instruct (Cloudflare)",
    description:
      "Cloudflare-hosted Llama 3.3 70B FP8 model for edge text generation.",
    mediaKind: "text",
    capabilities: {
      contextWindow: 24000,
      chat: true,
      scriptwriting: true,
      creativeDirector: true,
    },
  },
];
