import { describe, expect, it, vi } from "vitest";
import { createNvidiaProvider, mapNvidiaError } from "../src/nvidia";
import { ProviderConfigurationError, ProviderRequestError } from "../src";

describe("mapNvidiaError", () => {
  it("parses valid error bodies", () => {
    const error = mapNvidiaError(
      429,
      JSON.stringify({
        error: {
          message: "Rate limit exceeded",
          type: "rate_limit_error",
          code: "rate_limit",
        },
      }),
    );
    expect(error.retryable).toBe(true);
    expect(error.code).toBe("rate_limit");
  });

  it("handles missing error codes and non-JSON bodies", () => {
    const error = mapNvidiaError(500, "Internal Server Error");
    expect(error.retryable).toBe(true);
    expect(error.code).toBe("HTTP_500");
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

  it("successfully completes a reasoning request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          id: "req-123",
          choices: [
            {
              message: {
                role: "assistant",
                content: JSON.stringify({ result: "success" }),
              },
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
          },
        }),
    } as unknown as Response);

    const provider = createNvidiaProvider({
      ...validConfig,
      fetch: fetchMock,
    });

    const result = await provider.complete({
      idempotencyKey: "test-idemp",
      modelId: "",
      systemPrompt: "You are a helpful assistant.",
      userPrompt: "Hello",
      responseSchemaName: "test-schema",
    });

    expect(result.providerRequestId).toBe("req-123");
    expect(result.content).toEqual({ result: "success" });
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(20);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
    });

    const body = JSON.parse(options.body as string);
    expect(body.model).toBe("nvidia/nemotron-3-nano-omni-30b-a3b-reasoning");
    expect(body.messages).toHaveLength(2);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("throws ProviderRequestError on HTTP errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { code: "unauthorized" } }),
    } as unknown as Response);

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
});
