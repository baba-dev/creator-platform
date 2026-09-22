import { describe, expect, it, vi } from "vitest";
import { ProviderConfigurationError, ProviderRequestError } from "../src";
import {
  createNvidiaProvider,
  mapNvidiaError,
  readResponseText,
  safeFetch,
} from "../src/nvidia";

describe("mapNvidiaError", () => {
  it("classifies throttling as retryable without reflecting provider messages", () => {
    const error = mapNvidiaError(
      429,
      JSON.stringify({
        error: {
          message: "secret provider detail",
          type: "rate_limit_error",
          code: "rate_limit",
        },
      }),
    );
    expect(error.retryable).toBe(true);
    expect(error.code).toBe("rate_limit");
    expect(error.message).not.toContain("secret provider detail");
  });

  it("treats authentication errors as non-retryable", () => {
    const error = mapNvidiaError(401, "not-json");
    expect(error.retryable).toBe(false);
    expect(error.code).toBe("HTTP_401");
  });

  it("handles transient server failures", () => {
    const error = mapNvidiaError(503, "unavailable");
    expect(error.retryable).toBe(true);
    expect(error.code).toBe("HTTP_503");
  });
});

describe("createNvidiaProvider", () => {
  const validConfig = {
    apiKey: "test-key",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    defaultModel: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
  };

  it("throws on missing config", () => {
    expect(() =>
      createNvidiaProvider({ ...validConfig, apiKey: "" }),
    ).toThrowError(ProviderConfigurationError);
  });

  it("rejects insecure remote provider URLs", () => {
    expect(() =>
      createNvidiaProvider({
        ...validConfig,
        baseUrl: "http://example.com/v1",
      }),
    ).toThrowError(ProviderConfigurationError);
  });

  it("allows localhost HTTP for self-hosted development", () => {
    expect(() =>
      createNvidiaProvider({
        ...validConfig,
        baseUrl: "http://127.0.0.1:8000/v1",
      }),
    ).not.toThrow();
  });

  it("successfully completes an instruct-mode reasoning request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "req-123",
          choices: [
            {
              message: {
                role: "assistant",
                content: JSON.stringify({ enhancedPrompt: "A better prompt" }),
              },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const provider = createNvidiaProvider({
      ...validConfig,
      fetch: fetchMock,
    });

    const result = await provider.complete({
      idempotencyKey: "test-idemp",
      modelId: "",
      systemPrompt: "Return JSON.",
      userPrompt: "Hello",
      responseSchemaName: "prompt-enhancement-v1",
    });

    expect(result.providerRequestId).toBe("req-123");
    expect(result.content).toEqual({ enhancedPrompt: "A better prompt" });
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(20);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, options] = call!;
    expect(url).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({
      Authorization: "Bearer test-key",
      Accept: "application/json",
      "Content-Type": "application/json",
    });

    const body = JSON.parse(options.body as string);
    expect(body.model).toBe("nvidia/nemotron-3-nano-omni-30b-a3b-reasoning");
    expect(body.messages).toHaveLength(2);
    expect(body.temperature).toBe(0.2);
    expect(body.top_k).toBe(1);
    expect(body.max_tokens).toBe(1024);
    expect(body.stream).toBe(false);
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(body.response_format).toBeUndefined();
  });

  it("accepts a fenced JSON result defensively", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content:
                  'Here is the result:\n```json\n{"enhancedPrompt":"Cinematic light"}\n```',
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const provider = createNvidiaProvider({ ...validConfig, fetch: fetchMock });
    const result = await provider.complete({
      idempotencyKey: "test-idemp",
      modelId: "",
      systemPrompt: "Return JSON.",
      userPrompt: "Hello",
      responseSchemaName: "prompt-enhancement-v1",
    });
    expect(result.content).toEqual({ enhancedPrompt: "Cinematic light" });
  });

  it("throws ProviderRequestError on HTTP errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "unauthorized" } }), {
        status: 401,
      }),
    );

    const provider = createNvidiaProvider({
      ...validConfig,
      fetch: fetchMock,
    });

    await expect(
      provider.complete({
        idempotencyKey: "test-idemp",
        modelId: "",
        systemPrompt: "sys",
        userPrompt: "usr",
        responseSchemaName: "schema",
      }),
    ).rejects.toThrowError(ProviderRequestError);
  });

  it("aborts and cancels stream when response body stalls beyond total deadline", async () => {
    let capturedSignal: AbortSignal | undefined;
    let streamCancelled = false;

    const stalledStream = new ReadableStream({
      start() {
        // Leave open without emitting chunks
      },
      cancel() {
        streamCancelled = true;
      },
    });

    const fetchMock = vi.fn().mockImplementation((_url, init) => {
      capturedSignal = init?.signal;
      return Promise.resolve(new Response(stalledStream, { status: 200 }));
    });

    const provider = createNvidiaProvider({
      ...validConfig,
      requestTimeoutMs: 50,
      fetch: fetchMock,
    });

    const promise = provider.complete({
      idempotencyKey: "stalled-body-test",
      modelId: "",
      systemPrompt: "sys",
      userPrompt: "usr",
      responseSchemaName: "schema",
    });

    await expect(promise).rejects.toMatchObject({
      message: "NVIDIA network request failed",
      code: "REQUEST_OUTCOME_UNKNOWN",
      retryable: false,
    });

    expect(capturedSignal?.aborted).toBe(true);
    expect(streamCancelled).toBe(true);
  });

  it("aborts when response body exceeds idle deadline between chunks", async () => {
    let streamCancelled = false;

    const stalledStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"choices":'));
        // Stalls before completing
      },
      cancel() {
        streamCancelled = true;
      },
    });

    const fetchMock = vi.fn().mockImplementation(() => {
      return Promise.resolve(new Response(stalledStream, { status: 200 }));
    });

    const provider = createNvidiaProvider({
      ...validConfig,
      requestTimeoutMs: 5_000,
      idleTimeoutMs: 40,
      fetch: fetchMock,
    });

    const promise = provider.complete({
      idempotencyKey: "stalled-idle-test",
      modelId: "",
      systemPrompt: "sys",
      userPrompt: "usr",
      responseSchemaName: "schema",
    });

    await expect(promise).rejects.toMatchObject({
      message: "NVIDIA network request failed",
      code: "REQUEST_OUTCOME_UNKNOWN",
      retryable: false,
    });

    expect(streamCancelled).toBe(true);
  });

  it("triggers abort signal and cancels stream with extracted safeFetch and readResponseText", async () => {
    let capturedSignal: AbortSignal | undefined;
    let streamCancelled = false;

    const stalledStream = new ReadableStream({
      start() {},
      cancel() {
        streamCancelled = true;
      },
    });

    const fetchMock = vi.fn().mockImplementation((_url, init) => {
      capturedSignal = init?.signal;
      return Promise.resolve(new Response(stalledStream, { status: 200 }));
    });

    const response = await safeFetch(
      fetchMock,
      "https://integrate.api.nvidia.com/v1/chat/completions",
      {},
      50,
    );

    const readPromise = readResponseText(response, 1024 * 1024);

    await expect(readPromise).rejects.toMatchObject({
      message: "NVIDIA network request failed",
      code: "REQUEST_OUTCOME_UNKNOWN",
      retryable: false,
    });

    expect(capturedSignal?.aborted).toBe(true);
    expect(streamCancelled).toBe(true);
  });
});
