import { describe, expect, it, vi } from "vitest";

import { ProviderConfigurationError, ProviderRequestError } from "../src/index";
import { createVisionAuthorizationHeaders } from "../src/byteplus/vision";
import {
  createBytePlusProvider,
  isBytePlusVisionConfigured,
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
      "dola-seedream-5-0-pro-260628",
      "seedream-4-5-251128",
      "seedream-4-0-250828",
      "dreamina-seedance-2-0-mini-260615",
      "dreamina-seedance-2-0-fast-260128",
      "dreamina-seedance-2-0-260128",
      "dreamina-seedance-2-5-260628",
      "omnihuman-1.5",
      "seed-tts-2.0",
      "dola-seed-2-1-turbo-260628",
      "seed-2-0-pro-260328",
      "seed-2-0-lite-260428",
      "seed-2-0-mini-260428",
      "seed-2-0-code-preview-260328",
      "doubao-seed-character-260628",
      "seed-1-8-251228",
      "seed-1-6-250915",
      "seed-1-6-flash-250715",
    ]);
    expect(
      models.find((model) => model.id === "seedream-5-0-260128")?.capabilities,
    ).toMatchObject({
      "aspectRatio:3:2": true,
      "aspectRatio:21:9": true,
      "resolution:3K": true,
      referenceImages: true,
      maxReferenceImages: 14,
    });
    expect(
      models.find((model) => model.id === "seedream-4-5-251128")?.capabilities,
    ).toMatchObject({
      "aspectRatio:2:3": true,
      "resolution:2K": true,
      "resolution:4K": true,
      referenceImages: true,
      maxReferenceImages: 14,
    });
    expect(
      models.find((model) => model.id === "seedream-4-5-251128")?.capabilities,
    ).not.toHaveProperty("resolution:3K");
    expect(
      models.find((model) => model.id === "seedream-4-0-250828")?.capabilities,
    ).toMatchObject({
      "aspectRatio:2:3": true,
      "resolution:1K": true,
      "resolution:2K": true,
      "resolution:4K": true,
      referenceImages: true,
      maxReferenceImages: 14,
    });
    expect(
      models.find((model) => model.id === "seedream-4-0-250828")?.capabilities,
    ).not.toHaveProperty("resolution:3K");
    expect(
      models.find((model) => model.id === "dreamina-seedance-2-5-260628")
        ?.capabilities,
    ).toMatchObject({
      minimumDurationSeconds: 4,
      maximumDurationSeconds: 30,
      fps: 24,
    });
  });

  it("detects complete BytePlus Vision credentials only", () => {
    expect(
      isBytePlusVisionConfigured({
        BYTEPLUS_VISION_ACCESS_KEY_ID: "ak",
        BYTEPLUS_VISION_SECRET_ACCESS_KEY: "sk",
      }),
    ).toBe(true);
    expect(
      isBytePlusVisionConfigured({
        BYTEPLUS_VISION_ACCESS_KEY_ID: "ak",
      }),
    ).toBe(false);
  });

  it("matches BytePlus canonical HMAC signing with the required header separator", () => {
    const body =
      '{"req_key":"realman_avatar_picture_omni15_cv","image_url":"https://creator.example/avatar.jpg","audio_url":"https://creator.example/speech.mp3","output_resolution":1080}';
    const headers = createVisionAuthorizationHeaders({
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
      url: new URL(
        "https://cv.byteplusapi.com/?Action=CVSubmitTask&Version=2024-06-06",
      ),
      body,
      now: new Date("2026-01-05T12:21:33Z"),
    });

    expect(headers["x-content-sha256"]).toBe(
      "a5bb142ffbe9d0afacb3e75923239696e5eadd3c2b939ef6d0badd364ecf000c",
    );
    expect(headers.authorization).toBe(
      "HMAC-SHA256 Credential=test-access-key/20260105/ap-singapore-1/cv/request, SignedHeaders=host;x-content-sha256;x-date, Signature=2d35a1ea9d3300e1c17ca70ea329d68f2ba9f7053b5013879ab18e9ad826aa7b",
    );
  });

  it("submits OmniHuman through the signed Vision API instead of ModelArk", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        code: 10000,
        data: { task_id: "7392616336519610409" },
        message: "Success",
      }),
    );
    const provider = createBytePlusProvider({
      region: "ap-southeast-1",
      visionAccessKeyId: "test-access-key",
      visionSecretAccessKey: "test-secret-key",
      fetch: fetchMock as typeof fetch,
    });

    const job = await provider.submit({
      idempotencyKey: "omnihuman-job-1",
      modelId: "omnihuman-1.5",
      mediaKind: "video",
      input: {
        workflow: "TALKING_AVATAR",
        prompt: "",
        sources: [
          {
            role: "AVATAR_IMAGE",
            url: "https://creator.example/avatar.jpg",
          },
          {
            role: "DRIVING_AUDIO",
            url: "https://creator.example/speech.mp3",
          },
        ],
        aspectRatio: "adaptive",
        resolution: "1080p",
        durationSeconds: -1,
        generateAudio: false,
        outputFormat: "mp4",
        returnLastFrame: false,
      },
    });

    expect(job).toEqual({
      providerRequestId: "vision:omnihuman:7392616336519610409",
      status: "submitted",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://cv.byteplusapi.com/?Action=CVSubmitTask&Version=2024-06-06",
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "content-type": "application/json",
      "x-content-sha256": expect.stringMatching(/^[a-f0-9]{64}$/),
      "x-date": expect.stringMatching(/^\d{8}T\d{6}Z$/),
      authorization: expect.stringContaining("Credential=test-access-key/"),
    });
    expect(JSON.stringify(init.headers)).not.toContain("test-secret-key");
    expect(JSON.parse(init.body as string)).toEqual({
      req_key: "realman_avatar_picture_omni15_cv",
      image_url: "https://creator.example/avatar.jpg",
      audio_url: "https://creator.example/speech.mp3",
      output_resolution: 1080,
    });
  });

  it("polls and cancels OmniHuman Vision task identifiers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          code: 10000,
          data: {
            status: "done",
            resp_data: JSON.stringify({
              video_url: "https://cdn.example.com/omnihuman.mp4",
            }),
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 10000,
          data: {
            req_key: "realman_avatar_picture_omni15_cv",
            task_id: "task-123",
          },
        }),
      );
    const provider = createBytePlusProvider({
      region: "ap-southeast-1",
      visionAccessKeyId: "test-access-key",
      visionSecretAccessKey: "test-secret-key",
      fetch: fetchMock as typeof fetch,
    });

    await expect(
      provider.getJob("vision:omnihuman:task-123"),
    ).resolves.toMatchObject({
      status: "succeeded",
      outputUrls: ["https://cdn.example.com/omnihuman.mp4"],
    });
    await provider.cancel("vision:omnihuman:task-123");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("Action=CVGetResult");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("Action=CVCancelTask");
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
      sequential_image_generation: "disabled",
      response_format: "url",
      watermark: false,
    });
  });

  it.each([
    ["16:9", "5504x3040"],
    ["9:16", "3040x5504"],
    ["4:3", "4704x3520"],
    ["3:4", "3520x4704"],
    ["21:9", "6240x2656"],
  ])("uses the documented 4K dimensions for %s", async (aspectRatio, size) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ data: [{ url: "https://cdn.example.com/image.png" }] }),
      );
    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: fetchMock as typeof fetch,
    });

    await provider.submit({
      idempotencyKey: `image-4k-${aspectRatio}`,
      modelId: "seedream-5-0-260128",
      mediaKind: "image",
      input: { prompt: "A studio photograph", aspectRatio, resolution: "4K" },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).size).toBe(size);
  });

  it.each([
    ["1:1", "3072x3072"],
    ["4:3", "3456x2592"],
    ["3:4", "2592x3456"],
    ["16:9", "4096x2304"],
    ["9:16", "2304x4096"],
    ["3:2", "3744x2496"],
    ["2:3", "2496x3744"],
    ["21:9", "4704x2016"],
  ])(
    "uses the documented Lite 3K dimensions for %s",
    async (aspectRatio, size) => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse({
          data: [{ url: "https://cdn.example.com/image.png" }],
        }),
      );
      const provider = createBytePlusProvider({
        ...validConfig,
        fetch: fetchMock as typeof fetch,
      });

      await provider.submit({
        idempotencyKey: `image-3k-${aspectRatio}`,
        modelId: "seedream-5-0-260128",
        mediaKind: "image",
        input: {
          prompt: "A studio photograph",
          aspectRatio,
          resolution: "3K",
        },
      });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string).size).toBe(size);
    },
  );

  it("rejects 3K for Seedream 4.5 before provider dispatch", async () => {
    const fetchMock = vi.fn();
    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: fetchMock as typeof fetch,
    });

    await expect(
      provider.submit({
        idempotencyKey: "image-45-3k",
        modelId: "seedream-4-5-251128",
        mediaKind: "image",
        input: { prompt: "test", resolution: "3K" },
      }),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_RESOLUTION",
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits one or multiple private reference images using BytePlus image input", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ data: [{ url: "https://cdn.example.com/image.png" }] }),
      );
    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: fetchMock as typeof fetch,
    });
    const refs = [
      "data:image/png;base64,aGVsbG8=",
      "data:image/jpeg;base64,d29ybGQ=",
    ];

    await provider.submit({
      idempotencyKey: "image-reference-set",
      modelId: "seedream-5-0-260128",
      mediaKind: "image",
      input: {
        prompt: "Use the reference images",
        resolution: "2K",
        referenceImages: refs,
      },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).image).toEqual(refs);
  });

  it("requests a bounded related-image sequence from BytePlus", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          { url: "https://cdn.example.com/image-1.png" },
          { url: "https://cdn.example.com/image-2.png" },
          { url: "https://cdn.example.com/image-3.png" },
        ],
      }),
    );
    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: fetchMock as typeof fetch,
    });

    const result = await provider.submit({
      idempotencyKey: "image-related-set",
      modelId: "seedream-5-0-260128",
      mediaKind: "image",
      input: {
        prompt: "Three related campaign images",
        outputCount: 3,
        referenceImages: ["data:image/png;base64,aGVsbG8="],
      },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      sequential_image_generation: "auto",
      sequential_image_generation_options: { max_images: 3 },
    });
    expect(result.outputUrls).toEqual([
      "https://cdn.example.com/image-1.png",
      "https://cdn.example.com/image-2.png",
      "https://cdn.example.com/image-3.png",
    ]);
  });

  it("rejects input plus output images above BytePlus's total limit", async () => {
    const fetchMock = vi.fn();
    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: fetchMock as typeof fetch,
    });
    const referenceImages = Array.from(
      { length: 14 },
      (_, index) =>
        `data:image/png;base64,${Buffer.from(String(index)).toString("base64")}`,
    );

    await expect(
      provider.submit({
        idempotencyKey: "image-over-limit",
        modelId: "seedream-4-5-251128",
        mediaKind: "image",
        input: {
          prompt: "Too many total images",
          outputCount: 2,
          referenceImages,
        },
      }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
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
      sequential_image_generation: "disabled",
      response_format: "url",
      watermark: false,
    });
  });

  it("submits Seedream 4.0 with its 1K mapping, references and bounded sequential output", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          { url: "https://cdn.example.com/image-40-1.jpg" },
          { url: "https://cdn.example.com/image-40-2.jpg" },
          { url: "https://cdn.example.com/image-40-3.jpg" },
        ],
      }),
    );
    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: fetchMock as typeof fetch,
    });

    const result = await provider.submit({
      idempotencyKey: "image-job-40-1k",
      modelId: "seedream-4-0-250828",
      mediaKind: "image",
      input: {
        prompt: "Three consistent product campaign frames",
        aspectRatio: "16:9",
        resolution: "1K",
        outputFormat: "png",
        outputCount: 3,
        referenceImages: ["data:image/jpeg;base64,aGVsbG8="],
      },
    });

    expect(result.outputUrls).toHaveLength(3);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: "seedream-4-0-250828",
      size: "1312x736",
      image: "data:image/jpeg;base64,aGVsbG8=",
      sequential_image_generation: "auto",
      sequential_image_generation_options: { max_images: 3 },
      response_format: "url",
      watermark: false,
    });
    expect(body).not.toHaveProperty("output_format");
  });

  it.each([
    ["seedream-5-0-260128", "1K"],
    ["seedream-4-5-251128", "1K"],
    ["seedream-4-0-250828", "3K"],
  ])(
    "rejects %s resolution %s before provider dispatch",
    async (modelId, resolution) => {
      const fetchMock = vi.fn();
      const provider = createBytePlusProvider({
        ...validConfig,
        fetch: fetchMock as typeof fetch,
      });

      await expect(
        provider.submit({
          idempotencyKey: `unsupported-resolution-${modelId}-${resolution}`,
          modelId,
          mediaKind: "image",
          input: { prompt: "test", resolution },
        }),
      ).rejects.toMatchObject({
        code: "UNSUPPORTED_RESOLUTION",
        retryable: false,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

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
      output_format: "mp4",
      return_last_frame: true,
      seed: 42,
    });
  });

  it("submits a video reference with the explicit reference task type", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: "task-reference-1" }));
    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: fetchMock as typeof fetch,
    });
    await provider.submit({
      idempotencyKey: "video-reference-1",
      modelId: "dreamina-seedance-2-5-260628",
      mediaKind: "video",
      input: {
        prompt: "Use the lighting and camera movement of this clip",
        durationSeconds: 5,
        resolution: "720p",
        aspectRatio: "16:9",
        referenceVideoUrl:
          "https://creator.example.com/api/provider-media/asset1?jobId=job1&grant=token",
      },
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      omni_reference_task_type: "reference",
      content: [
        {
          type: "text",
          text: "Use the lighting and camera movement of this clip",
        },
        {
          type: "video_url",
          video_url: {
            url: "https://creator.example.com/api/provider-media/asset1?jobId=job1&grant=token",
          },
          role: "reference_video",
        },
      ],
    });
    await expect(
      provider.submit({
        idempotencyKey: "mixed-reference-1",
        modelId: "dreamina-seedance-2-5-260628",
        mediaKind: "video",
        input: {
          prompt: "mixed",
          referenceVideoUrl: "https://example.com/ref.mp4",
          firstFrameImage: "data:image/png;base64,AAAA",
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT", retryable: false });
  });

  it("submits ordered multimodal Seedance 2.5 reference content", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: "task-multimodal-1" }));
    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: fetchMock as typeof fetch,
    });

    await provider.submit({
      idempotencyKey: "video-multimodal-1",
      modelId: "dreamina-seedance-2-5-260628",
      mediaKind: "video",
      input: {
        workflow: "REFERENCE",
        prompt: "Use Image 1, Video 1 and Audio 1",
        sources: [
          {
            role: "REFERENCE_IMAGE",
            url: "https://creator.example.com/api/provider-media/image",
          },
          {
            role: "REFERENCE_VIDEO",
            url: "https://creator.example.com/api/provider-media/video",
          },
          {
            role: "REFERENCE_AUDIO",
            url: "https://creator.example.com/api/provider-media/audio",
          },
        ],
        aspectRatio: "16:9",
        resolution: "720p",
        durationSeconds: 8,
        outputFormat: "mov",
      },
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body.omni_reference_task_type).toBe("reference");
    expect(body.output_format).toBe("mov");
    expect(body.return_last_frame).toBe(true);
    expect(body.content).toEqual([
      { type: "text", text: "Use Image 1, Video 1 and Audio 1" },
      {
        type: "image_url",
        image_url: {
          url: "https://creator.example.com/api/provider-media/image",
        },
        role: "reference_image",
      },
      {
        type: "video_url",
        video_url: {
          url: "https://creator.example.com/api/provider-media/video",
        },
        role: "reference_video",
      },
      {
        type: "audio_url",
        audio_url: {
          url: "https://creator.example.com/api/provider-media/audio",
        },
        role: "reference_audio",
      },
    ]);
  });

  it("promotes a Seedance 2.5 Draft without resending auto-reused inputs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: "task-final-1" }));
    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: fetchMock as typeof fetch,
    });

    await provider.submit({
      idempotencyKey: "video-draft-final-1",
      modelId: "dreamina-seedance-2-5-260628",
      mediaKind: "video",
      input: {
        workflow: "DRAFT_FINAL",
        prompt: "",
        sources: [],
        aspectRatio: "16:9",
        resolution: "1080p",
        durationSeconds: 5,
        outputFormat: "mov",
        draftProviderTaskId: "task-draft-1",
      },
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body).toEqual({
      model: "dreamina-seedance-2-5-260628",
      content: [{ type: "draft_task", draft_task: { id: "task-draft-1" } }],
      resolution: "1080p",
      output_format: "mov",
      return_last_frame: true,
      watermark: false,
    });
  });

  it("submits first and last frames with explicit BytePlus roles", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: "task-frame-1" }));
    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: fetchMock as typeof fetch,
    });
    await provider.submit({
      idempotencyKey: "video-frame-1",
      modelId: "dreamina-seedance-2-5-260628",
      mediaKind: "video",
      input: {
        prompt: "The character turns",
        aspectRatio: "adaptive",
        resolution: "720p",
        durationSeconds: 5,
        firstFrameImage: "data:image/png;base64,AA==",
        lastFrameImage: "data:image/png;base64,AQ==",
      },
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body.ratio).toBe("adaptive");
    expect(body.content).toEqual([
      { type: "text", text: "The character turns" },
      {
        type: "image_url",
        image_url: { url: "data:image/png;base64,AA==" },
        role: "first_frame",
      },
      {
        type: "image_url",
        image_url: { url: "data:image/png;base64,AQ==" },
        role: "last_frame",
      },
    ]);
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
          content: {
            video_url: "https://cdn.example.com/video.mp4",
            last_frame_url: "https://cdn.example.com/last-frame.jpg",
          },
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
      lastFrameUrl: "https://cdn.example.com/last-frame.jpg",
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

  it("submits a text chat completion request and decodes content and token usage", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "chatcmpl-seed-1",
        choices: [
          {
            message: {
              role: "assistant",
              content: "Hello from Seed!",
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
    );
    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: fetchMock as typeof fetch,
    });

    const job = await provider.submit({
      idempotencyKey: "chat-job-1",
      modelId: "dola-seed-2-1-turbo-260628",
      mediaKind: "text",
      input: {
        messages: [
          { role: "system", content: "You are a creative assistant." },
          { role: "user", content: "Hello Seed!" },
        ],
        temperature: 0.7,
        maxTokens: 1024,
      },
    });

    expect(job).toMatchObject({
      providerRequestId: "chatcmpl-seed-1",
      status: "succeeded",
      inlineOutputs: [
        {
          mediaType: "text/plain",
          dataBase64: Buffer.from("Hello from Seed!", "utf8").toString(
            "base64",
          ),
        },
      ],
      rawUsage: {
        prompt_tokens: 15,
        completion_tokens: 8,
        total_tokens: 23,
      },
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://ark.ap-southeast.bytepluses.com/api/v3/chat/completions",
    );
    expect(init.headers).toMatchObject({
      authorization: "Bearer test-byteplus-api-key",
      "content-type": "application/json",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      model: "dola-seed-2-1-turbo-260628",
      messages: [
        { role: "system", content: "You are a creative assistant." },
        { role: "user", content: "Hello Seed!" },
      ],
      temperature: 0.7,
      max_tokens: 1024,
    });
  });

  it("submits Character Chat using doubao-seed-character-260628", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "chatcmpl-char-1",
        choices: [
          {
            message: {
              role: "assistant",
              content: "Welcome to my salon, darling!",
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 12,
          total_tokens: 62,
        },
      }),
    );
    const provider = createBytePlusProvider({
      ...validConfig,
      fetch: fetchMock as typeof fetch,
    });

    const job = await provider.submit({
      idempotencyKey: "char-job-1",
      modelId: "doubao-seed-character-260628",
      mediaKind: "text",
      input: {
        messages: [
          {
            role: "system",
            content: "You are an eccentric 1920s Parisian artist.",
          },
          { role: "user", content: "Bonjour!" },
        ],
      },
    });

    expect(job.status).toBe("succeeded");
    expect(job.providerRequestId).toBe("chatcmpl-char-1");
  });

  it("requires ModelArk API key for text completions", async () => {
    const provider = createBytePlusProvider({
      region: "ap-southeast-1",
      speechApiKey: "speech-only-key",
    });
    await expect(
      provider.submit({
        idempotencyKey: "text-job-no-key",
        modelId: "seed-2-0-lite-260428",
        mediaKind: "text",
        input: {
          messages: [{ role: "user", content: "Hi" }],
        },
      }),
    ).rejects.toBeInstanceOf(ProviderConfigurationError);
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

  it("returns after a timeout even if stream cancellation never settles", async () => {
    const stream = new ReadableStream<Uint8Array>({
      cancel: () => new Promise<void>(() => {}),
    });
    const response = await safeFetch(
      vi.fn().mockResolvedValue(new Response(stream)) as typeof fetch,
      "https://ark.ap-southeast.bytepluses.com/api/v3/images/generations",
      {},
      30,
    );
    await expect(readResponseText(response, 100)).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
    });
  });

  it("returns the size error even if cancellation never settles", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(101));
      },
      cancel: () => new Promise<void>(() => {}),
    });
    const response = await safeFetch(
      vi.fn().mockResolvedValue(new Response(stream)) as typeof fetch,
      "https://ark.ap-southeast.bytepluses.com/api/v3/images/generations",
      {},
      100,
    );
    await expect(readResponseText(response, 100)).rejects.toMatchObject({
      code: "RESPONSE_TOO_LARGE",
      retryable: true,
    });
  });

  it("preserves timeout classification when an HTTP error body stalls", async () => {
    const provider = createBytePlusProvider({
      ...validConfig,
      requestTimeoutMs: 30,
      fetch: vi
        .fn()
        .mockResolvedValue(new Response(new ReadableStream(), { status: 503 })),
    });
    await expect(
      provider.submit({
        idempotencyKey: "stalled-error-body",
        modelId: "seedream-5-0-260128",
        mediaKind: "image",
        input: { prompt: "test" },
      }),
    ).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
  });

  it("bounds text fallback when the response offers no stream reader", async () => {
    const fallback = {
      body: null,
      text: () => new Promise<string>(() => {}),
    } as Response;
    const response = await safeFetch(
      vi.fn().mockResolvedValue(fallback) as typeof fetch,
      "https://ark.ap-southeast.bytepluses.com/api/v3/images/generations",
      {},
      30,
    );
    await expect(readResponseText(response, 100)).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
    });
  });
});
