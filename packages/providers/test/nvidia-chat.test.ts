import { describe, expect, it, vi } from "vitest";
import { ProviderConfigurationError, ProviderRequestError } from "../src";
import { VERIFIED_NVIDIA_MODELS } from "../src/catalog";
import { createNvidiaProvider } from "../src/nvidia";

const model = "nvidia/nemotron-3.5-lightning-30b-a3b";
const config = {
  apiKey: "unit-test-key",
  baseUrl: "https://integrate.api.nvidia.com/v1",
  defaultModel: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
};

function completion(content: string | null, usage?: Record<string, number>) {
  return new Response(
    JSON.stringify({
      id: "request-456",
      choices: [{ message: { role: "assistant", content } }],
      ...(usage ? { usage } : {}),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("NVIDIA NIM chat integration", () => {
  it("catalogs curated models as TEXT but preserves Nano Omni as REASONING", () => {
    expect(VERIFIED_NVIDIA_MODELS.filter((entry) => entry.mediaKind === "text")).toHaveLength(9);
    const lightning = VERIFIED_NVIDIA_MODELS.find((entry) => entry.id === model);
    expect(lightning?.capabilities["task:character-chat"]).toBe(true);
    expect(lightning?.capabilities["task:prompt-enhancement"]).toBe(true);
    expect(VERIFIED_NVIDIA_MODELS.find((entry) => entry.id === config.defaultModel)?.mediaKind).toBe("reasoning");
  });

  it("passes multi-turn history with safe common NIM parameters and captures token usage", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      completion("Hello back", {
        prompt_tokens: 24,
        completion_tokens: 5,
        total_tokens: 29,
      }),
    );
    const provider = createNvidiaProvider({ ...config, fetch: fetchMock });
    const result = await provider.chat({
      idempotencyKey: "test-1",
      modelId: model,
      messages: [
        { role: "system", content: "Be friendly." },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" },
        { role: "user", content: "Again" },
      ],
      temperature: 1.5,
      maxTokens: 512,
    });
    expect(result).toEqual({
      providerRequestId: "request-456",
      content: "Hello back",
      usage: { promptTokens: 24, completionTokens: 5, totalTokens: 29 },
    });
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    const body = JSON.parse(options.body as string);
    expect(body).toEqual({
      model,
      messages: [
        { role: "system", content: "Be friendly." },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" },
        { role: "user", content: "Again" },
      ],
      temperature: 1,
      max_tokens: 512,
      stream: false,
    });
    expect(JSON.stringify(body)).not.toContain("unit-test-key");
    expect(options.headers.Authorization).toBe("Bearer unit-test-key");
  });

  it("validates requested JSON locally without assuming upstream JSON-mode support", async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion('{"answer":"ok"}'));
    const provider = createNvidiaProvider({ ...config, fetch: fetchMock });
    const result = await provider.chat({
      idempotencyKey: "test-2",
      modelId: "z-ai/glm-5.3-flash",
      messages: [{ role: "user", content: "Give JSON" }],
      responseFormat: "json_object",
    });
    expect(result.content).toBe('{"answer":"ok"}');
    expect(result.usage).toBeUndefined();
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.messages[0].role).toBe("system");
    expect(body.response_format).toBeUndefined();
    expect(body.top_k).toBeUndefined();
  });

  it("rejects malformed JSON and does not fabricate billed token usage", async () => {
    const provider = createNvidiaProvider({
      ...config,
      fetch: vi.fn().mockResolvedValue(completion("This is not JSON")),
    });
    await expect(provider.chat({
      idempotencyKey: "test-3",
      modelId: model,
      messages: [{ role: "user", content: "Give JSON" }],
      responseFormat: "json_object",
    })).rejects.toMatchObject({ code: "INVALID_PROVIDER_RESPONSE", retryable: false });
  });

  it("does not expose private reasoning blocks as assistant replies", async () => {
    const provider = createNvidiaProvider({
      ...config,
      fetch: vi.fn().mockResolvedValue(completion("<think>internal</think> Public answer")),
    });
    const result = await provider.chat({
      idempotencyKey: "test-4",
      modelId: model,
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(result.content).toBe("Public answer");
  });

  it("fails closed for unregistered models and invalid inputs before network dispatch", async () => {
    const fetchMock = vi.fn();
    const provider = createNvidiaProvider({ ...config, fetch: fetchMock });
    await expect(provider.chat({
      idempotencyKey: "test-5",
      modelId: "nvidia/unknown-model",
      messages: [{ role: "user", content: "Hello" }],
    })).rejects.toBeInstanceOf(ProviderConfigurationError);
    await expect(provider.chat({
      idempotencyKey: "test-6",
      modelId: model,
      messages: [{ role: "user", content: "Hello" }],
      maxTokens: 9000,
    })).rejects.toBeInstanceOf(ProviderRequestError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an empty provider reply instead of settling a successful chat turn", async () => {
    const provider = createNvidiaProvider({
      ...config,
      fetch: vi.fn().mockResolvedValue(completion(null)),
    });
    await expect(provider.chat({
      idempotencyKey: "test-7",
      modelId: model,
      messages: [{ role: "user", content: "Hello" }],
    })).rejects.toMatchObject({ code: "INVALID_PROVIDER_RESPONSE" });
  });
});
