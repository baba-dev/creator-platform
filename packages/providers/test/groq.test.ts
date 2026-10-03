import { describe, expect, it, vi } from "vitest";
import { ProviderConfigurationError } from "../src";
import {
  createGroqProvider,
  mapGroqError,
  generateSrtFromSegments,
  generateVttFromSegments,
} from "../src/groq";

describe("mapGroqError", () => {
  it("classifies 429 as retryable without leaking provider messages", () => {
    const error = mapGroqError(
      429,
      JSON.stringify({
        error: {
          message: "Rate limit reached for model openai/gpt-oss-120b",
          type: "tokens",
          code: "rate_limit_exceeded",
        },
      }),
    );
    expect(error.retryable).toBe(true);
    expect(error.code).toBe("rate_limit_exceeded");
    expect(error.message).not.toContain("Rate limit reached");
  });

  it("classifies 401 as non-retryable", () => {
    const error = mapGroqError(401, "unauthorized");
    expect(error.retryable).toBe(false);
    expect(error.code).toBe("HTTP_401");
  });

  it("classifies 503 as retryable", () => {
    const error = mapGroqError(503, "service unavailable");
    expect(error.retryable).toBe(true);
    expect(error.code).toBe("HTTP_503");
  });
});

describe("createGroqProvider", () => {
  const validConfig = {
    apiKey: "gsk_test123",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "openai/gpt-oss-120b",
  };

  it("throws on missing config", () => {
    expect(() =>
      createGroqProvider({ ...validConfig, apiKey: "" }),
    ).toThrowError(ProviderConfigurationError);
  });

  it("completes a chat request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "chatcmpl-groq-1",
          choices: [
            {
              message: {
                role: "assistant",
                content: "Hello from Groq LPU!",
              },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 15,
            completion_tokens: 8,
            total_tokens: 23,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const provider = createGroqProvider({
      ...validConfig,
      fetch: fetchMock,
    });

    const result = await provider.chat({
      idempotencyKey: "groq-key-1",
      modelId: "openai/gpt-oss-20b",
      messages: [{ role: "user", content: "Hi" }],
      responseFormat: "json_object",
    });

    expect(result.content).toBe("Hello from Groq LPU!");
    expect(result.usage?.totalTokens).toBe(23);
    expect(fetchMock).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      response_format: { type: "json_object" },
    });
  });

  it("completes a reasoning request and strips think tokens", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "r1-groq-1",
          choices: [
            {
              message: {
                role: "assistant",
                content:
                  '<think>Deep reasoning steps here</think>{"enhancedPrompt":"Cinematic golden hour over desert dunes"}',
              },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 25 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const provider = createGroqProvider({
      ...validConfig,
      fetch: fetchMock,
    });

    const result = await provider.complete({
      idempotencyKey: "r1-key-1",
      modelId: "openai/gpt-oss-120b",
      systemPrompt: "Enhance",
      userPrompt: "desert",
      responseSchemaName: "test",
    });

    expect(result.content).toEqual({
      enhancedPrompt: "Cinematic golden hour over desert dunes",
    });
  });

  it("transcribes audio and generates SRT / VTT subtitle strings", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          text: "Welcome to Aiwa Creator.",
          segments: [
            { id: 0, start: 0.0, end: 1.5, text: "Welcome to" },
            { id: 1, start: 1.5, end: 2.8, text: "Aiwa Creator." },
          ],
          duration: 2.8,
          language: "en",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const provider = createGroqProvider({
      ...validConfig,
      fetch: fetchMock,
    });

    const result = await provider.transcribe({
      idempotencyKey: "tx-1",
      audioBytes: new Uint8Array([1, 2, 3]),
      filename: "test.mp3",
    });

    expect(result.text).toBe("Welcome to Aiwa Creator.");
    expect(result.segments?.length).toBe(2);
    expect(result.srt).toContain("00:00:00,000 --> 00:00:01,500");
    expect(result.vtt).toContain("WEBVTT");
  });

  it("generates SRT and VTT formats correctly", () => {
    const segments = [
      { id: 1, start: 65.25, end: 68.5, text: "Scene two continues" },
    ];
    const srt = generateSrtFromSegments(segments);
    const vtt = generateVttFromSegments(segments);
    expect(srt).toContain("00:01:05,250 --> 00:01:08,500");
    expect(vtt).toContain("00:01:05.250 --> 00:01:08.500");
  });
});
