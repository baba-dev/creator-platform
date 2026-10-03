import { describe, expect, it, vi } from "vitest";
import { ProviderConfigurationError } from "../src";
import { createGeminiProvider, mapGeminiError } from "../src/gemini";

describe("mapGeminiError", () => {
  it("classifies RESOURCE_EXHAUSTED and 429 as retryable", () => {
    const error = mapGeminiError(
      429,
      JSON.stringify({
        error: {
          code: 429,
          status: "RESOURCE_EXHAUSTED",
          message: "Quota exceeded for project",
        },
      }),
    );
    expect(error.retryable).toBe(true);
    expect(error.code).toBe("RESOURCE_EXHAUSTED");
    expect(error.message).not.toContain("Quota exceeded");
  });

  it("classifies 403 as non-retryable", () => {
    const error = mapGeminiError(403, "forbidden");
    expect(error.retryable).toBe(false);
    expect(error.code).toBe("HTTP_403");
  });
});

describe("createGeminiProvider", () => {
  const validConfig = {
    apiKey: "AIzaSy_test123",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-3.8-flash",
  };

  it("throws on missing config", () => {
    expect(() =>
      createGeminiProvider({ ...validConfig, apiKey: "" }),
    ).toThrowError(ProviderConfigurationError);
  });

  it("completes a chat request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "chatcmpl-gemini-1",
          choices: [
            {
              message: {
                role: "assistant",
                content: "Structured creative advice from Gemini Flash.",
              },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 30,
            completion_tokens: 12,
            total_tokens: 42,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const provider = createGeminiProvider({
      ...validConfig,
      fetch: fetchMock,
    });

    const result = await provider.chat({
      idempotencyKey: "gemini-key-1",
      modelId: "gemini-3.5-flash-lite",
      messages: [{ role: "user", content: "Inspire me" }],
      responseFormat: "json_object",
    });

    expect(result.content).toBe(
      "Structured creative advice from Gemini Flash.",
    );
    expect(result.usage?.totalTokens).toBe(42);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      response_format: { type: "json_object" },
    });
  });

  it("completes a structured reasoning request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "gemini-reasoning-1",
          choices: [
            {
              message: {
                role: "assistant",
                content:
                  '```json\n{"enhancedPrompt":"Sunset over Jebel Akhdar"}\n```',
              },
              finish_reason: "stop",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const provider = createGeminiProvider({
      ...validConfig,
      fetch: fetchMock,
    });

    const result = await provider.complete({
      idempotencyKey: "reason-key-1",
      modelId: "gemini-3.8-flash",
      systemPrompt: "Enhance",
      userPrompt: "mountain",
      responseSchemaName: "test",
    });

    expect(result.content).toEqual({
      enhancedPrompt: "Sunset over Jebel Akhdar",
    });
  });

  it("fetches embeddings", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const provider = createGeminiProvider({
      ...validConfig,
      fetch: fetchMock,
    });

    const embeddings = await provider.embed(
      ["desert photo"],
      "gemini-embedding-001",
    );
    expect(embeddings.length).toBe(1);
    expect(embeddings[0]).toEqual([0.1, 0.2, 0.3]);
  });
});
