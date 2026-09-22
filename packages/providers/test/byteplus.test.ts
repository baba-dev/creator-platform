import { describe, expect, it, vi } from "vitest";

import { ProviderConfigurationError, ProviderRequestError } from "../src/index";
import {
  createBytePlusProvider,
  isBytePlusVoiceConfigured,
  mapBytePlusError,
  readResponseText,
  safeFetch,
  speechRateMultiplierToPercentage,
} from "../src/byteplus/index";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("BytePlus provider adapter", () => {
  const validConfig = {
    apiKey: "test-byteplus-api-key",
    region: "ap-southeast-1" as const,
  };

  it("rejects invalid configuration", () => {
    expect(() =>
      createBytePlusProvider({ ...validConfig, apiKey: "" }),
    ).toThrow(ProviderConfigurationError);
  });

  it("lists the exact supported BytePlus model identifiers", async () => {
    const models = await createBytePlusProvider(validConfig).listModels();
    expect(models.map((model) => model.id)).toEqual([
      "seedream-5-0-260128",
      "seedream-4-5-251128",
      "dreamina-seedance-2-5-260628",
      "seed-tts-2.0",
    ]);
    expect(
      models.find((model) => model.mediaKind === "video")?.capabilities,
    ).toMatchObject({
      minimumDurationSeconds: 4,
      maximumDurationSeconds: 30,
      fps: 24,
    });
  });

  it("submits an image request using the documented host and payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [{ url: "https://cdn.example.com/image.png" }],
        usage: { generated_images: 1 },
      }),
    );
    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: fetchMock as typeof fetch,
    });

    const job = await provider.submit({
      idempotencyKey: "image-job-1",
      modelId: "seedream-5-0-260128",
      mediaKind: "image",
      input: {
        prompt: "A studio product photograph",
        aspectRatio: "16:9",
        resolution: "2K",
      },
    });

    expect(job).toMatchObject({
      status: "succeeded",
      outputUrls: ["https://cdn.example.com/image.png"],
    });
    expect(job.providerRequestId).toMatch(/^image-[a-f0-9]{24}$/);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://ark.ap-southeast.bytepluses.com/api/v3/images/generations",
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      authorization: "Bearer test-byteplus-api-key",
      "content-type": "application/json",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      model: "seedream-5-0-260128",
      prompt: "A studio product photograph",
      size: "2848x1600",
      output_format: "png",
      response_format: "url",
      watermark: false,
    });
  });

  it("omits output_format for Seedream 4.5 because the live API rejects it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [{ url: "https://cdn.example.com/image-45.png" }],
      }),
    );
    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: fetchMock as typeof fetch,
    });

    await provider.submit({
      idempotencyKey: "image-job-45",
      modelId: "seedream-4-5-251128",
      mediaKind: "image",
      input: {
        prompt: "A studio product photograph",
        aspectRatio: "1:1",
        resolution: "2K",
        outputFormat: "png",
      },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      model: "seedream-4-5-251128",
      prompt: "A studio product photograph",
      size: "2048x2048",
      response_format: "url",
      watermark: false,
    });
  });

  it("rejects unsupported model and media-kind combinations", async () => {
    const provider = createBytePlusProvider(validConfig);
    await expect(
      provider.submit({
        idempotencyKey: "bad-model",
        modelId: "dreamina-seedance-2-5-260628",
        mediaKind: "image",
        input: { prompt: "test" },
      }),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_MODEL",
      retryable: false,
    });
  });

  it("validates image inputs without reflecting prompt data", async () => {
    const provider = createBytePlusProvider(validConfig);
    await expect(
      provider.submit({
        idempotencyKey: "invalid-image",
        modelId: "seedream-5-0-260128",
        mediaKind: "image",
        input: { prompt: "" },
      }),
    ).rejects.toMatchObject({
      message: "Invalid BytePlus image input",
      retryable: false,
    });
  });

  it("submits video with nested text content and supported options", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: "task-video-1" }));
    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: fetchMock as typeof fetch,
    });

    const job = await provider.submit({
      idempotencyKey: "video-job-1",
      modelId: "dreamina-seedance-2-5-260628",
      mediaKind: "video",
      input: {
        prompt: "A smooth camera move through a gallery",
        aspectRatio: "9:16",
        resolution: "1080p",
        durationSeconds: 12,
        generateAudio: true,
        seed: 42,
      },
    });

    expect(job).toEqual({
      providerRequestId: "task-video-1",
      status: "submitted",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      model: "dreamina-seedance-2-5-260628",
      content: [
        { type: "text", text: "A smooth camera move through a gallery" },
      ],
      resolution: "1080p",
      ratio: "9:16",
      duration: 12,
      generate_audio: true,
      watermark: false,
      seed: 42,
    });
  });

  it("polls running and successful video tasks", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ id: "task-video-1", status: "running" }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "task-video-1",
          status: "succeeded",
          content: { video_url: "https://cdn.example.com/video.mp4" },
          usage: { completion_tokens: 1 },
        }),
      );
    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: fetchMock as typeof fetch,
    });

    await expect(provider.getJob("task-video-1")).resolves.toMatchObject({
      status: "processing",
    });
    await expect(provider.getJob("task-video-1")).resolves.toMatchObject({
      status: "succeeded",
      outputUrls: ["https://cdn.example.com/video.mp4"],
    });
  });

  it("maps cancelled and expired video tasks", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ id: "cancelled", status: "cancelled" }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: "expired", status: "expired" }),
      );
    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: fetchMock as typeof fetch,
    });

    await expect(provider.getJob("cancelled")).resolves.toMatchObject({
      status: "cancelled",
    });
    await expect(provider.getJob("expired")).resolves.toMatchObject({
      status: "failed",
      errorCode: "TASK_EXPIRED",
    });
  });

  it("rejects a successful video response without an output URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: "task", status: "succeeded" }));
    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: fetchMock as typeof fetch,
    });
    await expect(provider.getJob("task")).rejects.toMatchObject({
      code: "INVALID_PROVIDER_RESPONSE",
      retryable: true,
    });
  });

  it("uses DELETE for cancellation and does not swallow a 404", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse({ code: "NotFound" }, 404));
    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: fetchMock as typeof fetch,
    });

    await expect(provider.cancel("task:to-cancel")).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/tasks/task%3Ato-cancel");
    expect(init.method).toBe("DELETE");
    await expect(provider.cancel("missing")).rejects.toMatchObject({
      code: "NotFound",
      retryable: false,
    });
  });

  it("rejects unsafe provider request identifiers before fetching", async () => {
    const fetchMock = vi.fn();
    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: fetchMock as typeof fetch,
    });

    await expect(provider.getJob("../task\nsecret")).rejects.toMatchObject({
      code: "INVALID_INPUT",
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("decodes Seed Speech streaming chunks into one inline audio output", async () => {
    const first = Buffer.from("first-audio-").toString("base64");
    const second = Buffer.from("second-audio").toString("base64");
    const response = new Response(
      [
        JSON.stringify({ reqid: "speech-request-1", code: 0, data: first }),
        JSON.stringify({ code: 0, sequence: -1, data: second }),
        JSON.stringify({
          code: 0,
          message: "",
          data: null,
          sentence: { phonemes: [], text: "Welcome", words: [] },
        }),
        JSON.stringify({ code: 20_000_000, message: "OK", data: null }),
      ].join("\n"),
      { status: 200, headers: { "content-type": "application/x-ndjson" } },
    );
    const fetchMock = vi.fn().mockResolvedValue(response);
    const provider = createBytePlusProvider({
      ...validConfig,
      speechApiKey: "speech-api-key",
      fetch: fetchMock as typeof fetch,
    });

    const job = await provider.submit({
      idempotencyKey: "speech-job-1",
      modelId: "seed-tts-2.0",
      mediaKind: "voice",
      input: {
        text: "Welcome",
        speaker: "speaker-id",
        format: "mp3",
        speechRate: 1.1,
      },
    });

    expect(job).toMatchObject({
      providerRequestId: "speech-request-1",
      status: "succeeded",
      inlineOutputs: [{ mediaType: "audio/mpeg" }],
      rawUsage: { outputBytes: 24 },
    });
    expect(
      Buffer.from(job.inlineOutputs![0]!.dataBase64, "base64").toString(),
    ).toBe("first-audio-second-audio");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://voice.ap-southeast-1.bytepluses.com/api/v3/tts/unidirectional",
    );
    expect(init.headers).toMatchObject({
      "x-api-key": "speech-api-key",
      "x-api-app-key": "aGjiRDfUWi",
      "x-api-resource-id": "seed-tts-2.0",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      user: { id: "creator-platform" },
      req_params: {
        text: "Welcome",
        speaker: "speaker-id",
        audio_params: {
          format: "mp3",
          sample_rate: 24_000,
          speech_rate: 10,
        },
      },
    });
  });

  it("requires separate speech credentials for voice synthesis", async () => {
    const provider = createBytePlusProvider(validConfig);
    await expect(
      provider.submit({
        idempotencyKey: "speech-job-2",
        modelId: "seed-tts-2.0",
        mediaKind: "voice",
        input: { text: "Welcome", speaker: "speaker-id" },
      }),
    ).rejects.toBeInstanceOf(ProviderConfigurationError);
  });

  it("maps UI speed multipliers to BytePlus speech-rate percentages", () => {
    expect(speechRateMultiplierToPercentage(0.5)).toBe(-50);
    expect(speechRateMultiplierToPercentage(1)).toBe(0);
    expect(speechRateMultiplierToPercentage(1.5)).toBe(50);
    expect(speechRateMultiplierToPercentage(2)).toBe(100);
    expect(() => speechRateMultiplierToPercentage(2.1)).toThrow();
  });

  it("does not treat legacy credentials as Seed Speech v3 configuration", () => {
    expect(
      isBytePlusVoiceConfigured({
        speechAppId: "legacy-app",
        speechAccessToken: "legacy-token",
      }),
    ).toBe(false);
    expect(isBytePlusVoiceConfigured({ speechApiKey: "seed-speech-key" })).toBe(
      true,
    );
  });

  it("keeps provider error messages and prompt content out of errors", () => {
    const error = mapBytePlusError(
      400,
      JSON.stringify({
        error: {
          code: "InvalidParameter",
          message: "Rejected secret prompt text",
        },
      }),
    );
    expect(error).toMatchObject({
      code: "InvalidParameter",
      retryable: false,
    });
    expect(error.message).toBe(
      "BytePlus request failed with status 400 (InvalidParameter)",
    );
    expect(error.message).not.toContain("secret prompt text");
  });

  it("extracts safe numeric Seed Speech error codes from header envelopes", () => {
    const error = mapBytePlusError(
      403,
      JSON.stringify({
        header: {
          reqid: "request-id",
          code: 45000030,
          message: "requested resource not granted",
        },
      }),
    );

    expect(error).toMatchObject({
      code: "SPEECH_45000030",
      retryable: false,
    });
    expect(error.message).toBe(
      "BytePlus request failed with status 403 (SPEECH_45000030)",
    );
    expect(error.message).not.toContain("requested resource not granted");
  });

  it.each([408, 429, 500, 502, 503, 504, 599])(
    "classifies status %i as retryable",
    (status) => {
      expect(mapBytePlusError(status, "").retryable).toBe(true);
    },
  );

  it.each([400, 401, 403, 404, 422])(
    "classifies status %i as non-retryable",
    (status) => {
      expect(mapBytePlusError(status, "").retryable).toBe(false);
    },
  );

  it("maps network failures to a stable retryable error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("contains secret"));
    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: fetchMock as typeof fetch,
    });

    const promise = provider.submit({
      idempotencyKey: "network-failure",
      modelId: "seedream-5-0-260128",
      mediaKind: "image",
      input: { prompt: "private prompt" },
    });
    await expect(promise).rejects.toMatchObject({
      message: "BytePlus network request failed",
      code: "NETWORK_ERROR",
      retryable: true,
    });
  });

  it("rejects malformed successful responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: fetchMock as typeof fetch,
    });
    await expect(
      provider.submit({
        idempotencyKey: "malformed",
        modelId: "seedream-5-0-260128",
        mediaKind: "image",
        input: { prompt: "test" },
      }),
    ).rejects.toMatchObject({
      code: "INVALID_PROVIDER_RESPONSE",
      retryable: true,
    });
  });

  it("uses a configured ModelArk base URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ data: [{ url: "https://cdn.example.com/image.png" }] }),
      );
    const provider = createBytePlusProvider({
      ...validConfig,
      modelArkBaseUrl: "https://proxy.example.com/modelark/",
      fetch: fetchMock as typeof fetch,
    });
    await provider.submit({
      idempotencyKey: "custom-base-url",
      modelId: "seedream-5-0-260128",
      mediaKind: "image",
      input: { prompt: "test" },
    });
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://proxy.example.com/modelark/images/generations",
    );
  });

  it("exposes ProviderRequestError type for callers", () => {
    expect(mapBytePlusError(400, "")).toBeInstanceOf(ProviderRequestError);
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

    const provider = createBytePlusProvider({
      ...validConfig,
      requestTimeoutMs: 50,
      fetch: fetchMock as typeof fetch,
    });

    const promise = provider.submit({
      idempotencyKey: "stalled-image-test",
      modelId: "seedream-5-0-260128",
      mediaKind: "image",
      input: { prompt: "test" },
    });

    await expect(promise).rejects.toMatchObject({
      message: "BytePlus network request failed",
      code: "REQUEST_TIMEOUT",
      retryable: true,
    });

    expect(capturedSignal?.aborted).toBe(true);
    expect(streamCancelled).toBe(true);
  });

  it("aborts when response body exceeds idle deadline between chunks", async () => {
    let streamCancelled = false;

    const stalledStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"data":'));
        // Stalls before completing
      },
      cancel() {
        streamCancelled = true;
      },
    });

    const fetchMock = vi.fn().mockImplementation(() => {
      return Promise.resolve(new Response(stalledStream, { status: 200 }));
    });

    const provider = createBytePlusProvider({
      ...validConfig,
      requestTimeoutMs: 5_000,
      idleTimeoutMs: 40,
      fetch: fetchMock as typeof fetch,
    });

    const promise = provider.submit({
      idempotencyKey: "stalled-idle-test",
      modelId: "seedream-5-0-260128",
      mediaKind: "image",
      input: { prompt: "test" },
    });

    await expect(promise).rejects.toMatchObject({
      message: "BytePlus network request failed",
      code: "REQUEST_TIMEOUT",
      retryable: true,
    });

    expect(streamCancelled).toBe(true);
  });

  it("cancels abandoned response body on successful task cancellation", async () => {
    let streamCancelled = false;

    const openStream = new ReadableStream({
      start() {},
      cancel() {
        streamCancelled = true;
      },
    });

    const fetchMock = vi.fn().mockImplementation(() => {
      return Promise.resolve(new Response(openStream, { status: 200 }));
    });

    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: fetchMock as typeof fetch,
    });

    await provider.cancel("task-to-cancel-123");

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
      fetchMock as typeof fetch,
      "https://ark.ap-southeast.bytepluses.com/api/v3/images/generations",
      {},
      50,
    );

    const readPromise = readResponseText(response, 1024 * 1024);

    await expect(readPromise).rejects.toMatchObject({
      message: "BytePlus network request failed",
      code: "REQUEST_TIMEOUT",
      retryable: true,
    });

    expect(capturedSignal?.aborted).toBe(true);
    expect(streamCancelled).toBe(true);
  });
});
