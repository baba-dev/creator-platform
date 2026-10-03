import { describe, expect, it, vi } from "vitest";
import { ProviderConfigurationError } from "../src";
import {
  createCloudflareAiProvider,
  mapCloudflareError,
} from "../src/cloudflare";

describe("mapCloudflareError", () => {
  it("classifies neuron quota/rate limit error as retryable", () => {
    const error = mapCloudflareError(
      429,
      JSON.stringify({
        success: false,
        errors: [{ code: 1000, message: "Neurons limit exceeded" }],
      }),
    );
    expect(error.retryable).toBe(true);
    expect(error.message).not.toContain("Neurons limit exceeded");
  });

  it("classifies 500 error as retryable", () => {
    const error = mapCloudflareError(500, "internal server error");
    expect(error.retryable).toBe(true);
    expect(error.code).toBe("HTTP_500");
  });
});

describe("createCloudflareAiProvider", () => {
  const validConfig = {
    apiToken: "cf_token_123",
    accountId: "cf_account_abc",
    baseUrl: "https://api.cloudflare.com/client/v4",
    defaultModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  };

  it("throws on missing token or accountId", () => {
    expect(() =>
      createCloudflareAiProvider({ ...validConfig, apiToken: "" }),
    ).toThrowError(ProviderConfigurationError);
    expect(() =>
      createCloudflareAiProvider({ ...validConfig, accountId: "" }),
    ).toThrowError(ProviderConfigurationError);
  });

  it("completes a chat request with Cloudflare result format", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          result: {
            response: "Screenplay lines generated via Cloudflare Llama 3.3.",
            usage: {
              prompt_tokens: 21,
              completion_tokens: 9,
              total_tokens: 30,
            },
          },
          success: true,
          errors: [],
          messages: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const provider = createCloudflareAiProvider({
      ...validConfig,
      fetch: fetchMock,
    });

    const result = await provider.chat({
      idempotencyKey: "cf-chat-1",
      modelId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      messages: [{ role: "user", content: "Write scene" }],
    });

    expect(result.content).toBe(
      "Screenplay lines generated via Cloudflare Llama 3.3.",
    );
    expect(result.usage).toEqual({
      promptTokens: 21,
      completionTokens: 9,
      totalTokens: 30,
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("completes reasoning request and parses JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          result: {
            response: '{"enhancedPrompt":"Desert sunrise over dunes"}',
            usage: {
              prompt_tokens: 40,
              completion_tokens: 20,
              total_tokens: 60,
            },
          },
          success: true,
          errors: [],
          messages: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const provider = createCloudflareAiProvider({
      ...validConfig,
      fetch: fetchMock,
    });

    const result = await provider.complete({
      idempotencyKey: "cf-reason-1",
      modelId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      systemPrompt: "Enhance",
      userPrompt: "desert",
      responseSchemaName: "test",
    });

    expect(result.content).toEqual({
      enhancedPrompt: "Desert sunrise over dunes",
    });
    expect(result.inputTokens).toBe(40);
    expect(result.outputTokens).toBe(20);
  });

  it("fetches embeddings with Cloudflare format", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          result: {
            data: [[0.5, 0.6, 0.7]],
          },
          success: true,
          errors: [],
          messages: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const provider = createCloudflareAiProvider({
      ...validConfig,
      fetch: fetchMock,
    });

    const embeddings = await provider.embed(
      ["video caption text"],
      "@cf/baai/bge-large-en-v1.5",
    );
    expect(embeddings).toEqual([[0.5, 0.6, 0.7]]);
  });
});
