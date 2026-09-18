import { describe, expect, it, vi } from "vitest";

import { ProviderConfigurationError } from "../src/index";
import {
  createBytePlusProvider,
  mapBytePlusError,
} from "../src/byteplus/index";

describe("BytePlus Provider Adapter", () => {
  const validConfig = {
    apiKey: "test-byteplus-api-key",
    region: "ap-southeast-1",
  };

  it("requires apiKey and region on construction", () => {
    expect(() =>
      createBytePlusProvider({ apiKey: "", region: "ap-southeast-1" }),
    ).toThrow(ProviderConfigurationError);

    expect(() => createBytePlusProvider({ apiKey: "key", region: "" })).toThrow(
      ProviderConfigurationError,
    );

    const provider = createBytePlusProvider(validConfig);
    expect(provider.name).toBe("byteplus");
  });

  it("lists verified BytePlus models with correct capabilities", async () => {
    const provider = createBytePlusProvider(validConfig);
    const models = await provider.listModels();

    expect(models).toHaveLength(4);
    expect(models.map((m) => m.id)).toEqual([
      "seedream-5-lite",
      "seedream-4-5",
      "seedance-2-5",
      "seed-speech-2",
    ]);

    const imageModel = models.find((m) => m.id === "seedream-5-lite");
    expect(imageModel?.mediaKind).toBe("image");
    expect(imageModel?.capabilities["aspectRatio:1:1"]).toBe(true);
    expect(imageModel?.capabilities.defaultSteps).toBe(30);

    const videoModel = models.find((m) => m.id === "seedance-2-5");
    expect(videoModel?.mediaKind).toBe("video");
    expect(videoModel?.capabilities["duration:5"]).toBe(true);

    const voiceModel = models.find((m) => m.id === "seed-speech-2");
    expect(voiceModel?.mediaKind).toBe("voice");
    expect(voiceModel?.capabilities["language:ar"]).toBe(true);
  });

  it("submits image generation request and returns output urls", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "req_img_123",
        data: [{ url: "https://byteplus-cdn.example.com/image.png" }],
        usage: { steps: 30 },
      }),
    });

    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: mockFetch as unknown as typeof fetch,
    });

    const job = await provider.submit({
      idempotencyKey: "idem_img_1",
      modelId: "seedream-5-lite",
      mediaKind: "image",
      input: {
        prompt: "A cinematic cityscape in Muscat",
        aspectRatio: "16:9",
        steps: 30,
      },
    });

    expect(job.status).toBe("succeeded");
    expect(job.providerRequestId).toBe("req_img_123");
    expect(job.outputUrls).toEqual([
      "https://byteplus-cdn.example.com/image.png",
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(url).toBe(
      "https://ark.ap-southeast-1.byteplus.com/api/v3/images/generations",
    );
    expect(init.headers["authorization"]).toBe("Bearer test-byteplus-api-key");
    expect(init.headers["x-idempotency-key"]).toBe("idem_img_1");

    const payload = JSON.parse(init.body as string);
    expect(payload.model).toBe("seedream-5-lite");
    expect(payload.size).toBe("1920x1080");
  });

  it("rejects invalid image input with non-retryable error", async () => {
    const provider = createBytePlusProvider(validConfig);

    await expect(
      provider.submit({
        idempotencyKey: "idem_img_invalid",
        modelId: "seedream-5-lite",
        mediaKind: "image",
        input: { prompt: "" }, // Empty prompt
      }),
    ).rejects.toMatchObject({
      name: "ProviderRequestError",
      retryable: false,
    });
  });

  it("submits video generation and returns task id", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "task_vid_999",
        status: "QUEUED",
      }),
    });

    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: mockFetch as unknown as typeof fetch,
    });

    const job = await provider.submit({
      idempotencyKey: "idem_vid_1",
      modelId: "seedance-2-5",
      mediaKind: "video",
      input: {
        prompt: "Drone footage of Sultan Qaboos Grand Mosque",
        aspectRatio: "16:9",
        durationSeconds: 5,
      },
    });

    expect(job.status).toBe("submitted");
    expect(job.providerRequestId).toBe("task_vid_999");

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://ark.ap-southeast-1.byteplus.com/api/v3/contents/generations/tasks",
    );
    const payload = JSON.parse(init.body as string);
    expect(payload.duration).toBe(5);
  });

  it("polls video task status until completion", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: "task_vid_999",
          status: "RUNNING",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: "task_vid_999",
          status: "SUCCEEDED",
          content: {
            video_url: "https://byteplus-cdn.example.com/output.mp4",
          },
        }),
      });

    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: mockFetch as unknown as typeof fetch,
    });

    const poll1 = await provider.getJob("task_vid_999");
    expect(poll1.status).toBe("processing");
    expect(poll1.outputUrls).toBeUndefined();

    const poll2 = await provider.getJob("task_vid_999");
    expect(poll2.status).toBe("succeeded");
    expect(poll2.outputUrls).toEqual([
      "https://byteplus-cdn.example.com/output.mp4",
    ]);
  });

  it("maps failed video task with error code", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "task_vid_failed",
        status: "FAILED",
        error: {
          code: "SAFETY_FILTER_TRIGGERED",
          message: "Prompt flagged by content moderation",
        },
      }),
    });

    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: mockFetch as unknown as typeof fetch,
    });

    const job = await provider.getJob("task_vid_failed");
    expect(job.status).toBe("failed");
    expect(job.errorCode).toBe("SAFETY_FILTER_TRIGGERED");
  });

  it("submits voice synthesis request using speechAccessToken", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "req_tts_1",
        data: [{ url: "https://byteplus-cdn.example.com/audio.mp3" }],
      }),
    });

    const provider = createBytePlusProvider({
      ...validConfig,
      speechAccessToken: "speech-token-xyz",
      fetch: mockFetch as unknown as typeof fetch,
    });

    const job = await provider.submit({
      idempotencyKey: "idem_voice_1",
      modelId: "seed-speech-2",
      mediaKind: "voice",
      input: {
        text: "Welcome to Aiwa Media Group",
        language: "en",
        voiceType: "expressive-1",
      },
    });

    expect(job.status).toBe("succeeded");
    expect(job.outputUrls).toEqual([
      "https://byteplus-cdn.example.com/audio.mp3",
    ]);

    const [, init] = mockFetch.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(init.headers["authorization"]).toBe("Bearer speech-token-xyz");
  });

  it("cancels video task cleanly", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: mockFetch as unknown as typeof fetch,
    });

    await expect(provider.cancel("task_to_cancel")).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/tasks/task_to_cancel/cancel");
    expect(init.method).toBe("POST");
  });

  it("classifies HTTP error codes correctly for retryability", () => {
    // Retryable: 429, 500, 502, 503, 504
    const err429 = mapBytePlusError(
      429,
      JSON.stringify({ message: "Rate limit exceeded" }),
    );
    expect(err429.retryable).toBe(true);

    const err500 = mapBytePlusError(500, "Internal Server Error");
    expect(err500.retryable).toBe(true);

    const err503 = mapBytePlusError(503, "Service Unavailable");
    expect(err503.retryable).toBe(true);

    // Non-retryable: 400, 401, 403, 404, 422
    const err400 = mapBytePlusError(
      400,
      JSON.stringify({ message: "Invalid parameters" }),
    );
    expect(err400.retryable).toBe(false);

    const err401 = mapBytePlusError(401, "Unauthorized");
    expect(err401.retryable).toBe(false);

    const err403 = mapBytePlusError(403, "Forbidden");
    expect(err403.retryable).toBe(false);

    const err422 = mapBytePlusError(422, "Unprocessable content");
    expect(err422.retryable).toBe(false);
  });

  it("treats network and connection failures as retryable", async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValue(new TypeError("fetch failed: ECONNRESET"));

    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: mockFetch as unknown as typeof fetch,
    });

    await expect(
      provider.submit({
        idempotencyKey: "idem_net_err",
        modelId: "seedream-5-lite",
        mediaKind: "image",
        input: { prompt: "Test prompt" },
      }),
    ).rejects.toMatchObject({
      name: "ProviderRequestError",
      retryable: true,
    });
  });
});
