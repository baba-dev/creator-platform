import { describe, expect, it, vi } from "vitest";

import { ProviderRequestError } from "../src/index";
import {
  createBytePlusProvider,
  normalizeBytePlusModelId,
} from "../src/byteplus/index";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("Seedream 5.0 Pro provider contract", () => {
  const config = {
    apiKey: "test-byteplus-api-key",
    region: "ap-southeast-1" as const,
  };

  it("normalizes supported aliases to the canonical deployed model id", () => {
    expect(normalizeBytePlusModelId("seedream-5-0-pro")).toBe(
      "dola-seedream-5-0-pro-260628",
    );
    expect(normalizeBytePlusModelId("seedream-5-0-pro-260628")).toBe(
      "dola-seedream-5-0-pro-260628",
    );
  });

  it("advertises only the provider-supported normal-generation envelope", async () => {
    const models = await createBytePlusProvider(config).listModels();
    const pro = models.find(
      (model) => model.id === "dola-seedream-5-0-pro-260628",
    );

    expect(pro?.capabilities).toMatchObject({
      "resolution:1K": true,
      "resolution:1.5K": true,
      "resolution:2K": true,
      maxReferenceImages: 10,
      maxGeneratedImages: 1,
      maxTotalInputOutputImages: 11,
      sequentialImages: false,
      preciseEditing: true,
    });
    expect(pro?.capabilities).not.toHaveProperty("resolution:4K");
    expect(pro?.capabilities).not.toHaveProperty("layerSeparation");
  });

  it("uses Pro-specific size mappings and omits unsupported sequential fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [{ url: "https://cdn.example.com/pro.png" }],
        usage: { generated_images: 1 },
      }),
    );
    const provider = createBytePlusProvider({
      ...config,
      fetch: fetchMock as typeof fetch,
    });

    await provider.submit({
      idempotencyKey: "seedream-pro-1",
      modelId: "seedream-5-0-pro",
      mediaKind: "image",
      input: {
        prompt: "Replace the object in <bbox>100 200 700 800</bbox>",
        aspectRatio: "16:9",
        resolution: "1.5K",
        outputFormat: "png",
        outputCount: 1,
        referenceImages: ["data:image/png;base64,AA=="],
      },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(payload.model).toBe("dola-seedream-5-0-pro-260628");
    expect(payload.size).toBe("2048x1152");
    expect(payload.output_format).toBe("png");
    expect(payload).not.toHaveProperty("sequential_image_generation");
    expect(payload).not.toHaveProperty("sequential_image_generation_options");
  });

  it("rejects unsupported 4K and multi-output requests before network I/O", async () => {
    const fetchMock = vi.fn();
    const provider = createBytePlusProvider({
      ...config,
      fetch: fetchMock as typeof fetch,
    });

    await expect(
      provider.submit({
        idempotencyKey: "seedream-pro-bad-resolution",
        modelId: "dola-seedream-5-0-pro-260628",
        mediaKind: "image",
        input: {
          prompt: "test",
          aspectRatio: "1:1",
          resolution: "4K",
          outputCount: 1,
        },
      }),
    ).rejects.toBeInstanceOf(ProviderRequestError);

    await expect(
      provider.submit({
        idempotencyKey: "seedream-pro-bad-count",
        modelId: "dola-seedream-5-0-pro-260628",
        mediaKind: "image",
        input: {
          prompt: "test",
          aspectRatio: "1:1",
          resolution: "1.5K",
          outputCount: 2,
        },
      }),
    ).rejects.toBeInstanceOf(ProviderRequestError);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
