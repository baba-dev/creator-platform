import { describe, expect, it, vi } from "vitest";
import { findCompatibleAlternativeModel } from "./capability-router";

vi.mock("@aiwa/db", () => ({
  db: {
    providerModel: {
      findMany: vi.fn().mockImplementation(({ where }) => {
        if (where.mediaKind === "IMAGE") {
          return Promise.resolve([
            {
              id: "model_image_1",
              providerModelId: "seedream-5-0-260128",
              displayName: "Seedream 5.0",
              provider: "BYTEPLUS",
              mediaKind: "IMAGE",
              capabilities: {
                "aspectRatio:1:1": true,
                "aspectRatio:9:16": true,
                "aspectRatio:16:9": true,
                "resolution:2K": true,
                referenceImages: true,
              },
              priceVersions: [{ id: "pv_1" }],
            },
            {
              id: "model_image_2",
              providerModelId: "seedream-4-0-260128",
              displayName: "Seedream 4.0",
              provider: "BYTEPLUS",
              mediaKind: "IMAGE",
              capabilities: {
                "aspectRatio:1:1": true,
                "aspectRatio:9:16": true,
                "aspectRatio:16:9": true,
                "resolution:2K": true,
                referenceImages: true,
              },
              priceVersions: [{ id: "pv_2" }],
            },
            {
              id: "model_image_3",
              providerModelId: "basic-image-gen",
              displayName: "Basic Image Model",
              provider: "CLOUDFLARE",
              mediaKind: "IMAGE",
              capabilities: {
                "aspectRatio:1:1": true,
                referenceImages: false, // does NOT support reference images
              },
              priceVersions: [{ id: "pv_3" }],
            },
          ]);
        }
        if (where.mediaKind === "VIDEO") {
          return Promise.resolve([
            {
              id: "model_avatar_1",
              providerModelId: "omnihuman-1.5",
              displayName: "OmniHuman 1.5",
              provider: "BYTEPLUS",
              mediaKind: "VIDEO",
              capabilities: {
                "aspectRatio:adaptive": true,
                "resolution:720p": true,
                talkingAvatar: true,
                returnLastFrame: false,
              },
              priceVersions: [{ id: "pv_avatar" }],
            },
            {
              id: "model_video_standard",
              providerModelId: "dreamina-seedance-2-0-260128",
              displayName: "Seedance 2.0",
              provider: "BYTEPLUS",
              mediaKind: "VIDEO",
              capabilities: {
                "aspectRatio:adaptive": true,
                "resolution:720p": true,
                firstFrame: true,
                returnLastFrame: true,
              },
              priceVersions: [{ id: "pv_video_standard" }],
            },
            {
              id: "model_video_fast",
              providerModelId: "dreamina-seedance-2-0-fast-260128",
              displayName: "Seedance 2.0 Fast",
              provider: "BYTEPLUS",
              mediaKind: "VIDEO",
              capabilities: {
                "aspectRatio:adaptive": true,
                "resolution:720p": true,
                firstFrame: true,
                returnLastFrame: true,
              },
              priceVersions: [{ id: "pv_video_fast" }],
            },
          ]);
        }
        return Promise.resolve([]);
      }),
    },
  },
}));

describe("Capability-Aware Model Router", () => {
  it("excludes current model and selects compatible alternate model", async () => {
    const result = await findCompatibleAlternativeModel({
      modality: "IMAGE",
      currentModelId: "model_image_1",
      excludeCurrentModel: true,
      requiredAspectRatio: "9:16",
      requiredResolution: "2K",
      requireReferenceImages: true,
    });

    expect(result).not.toBeNull();
    expect(result?.modelId).toBe("model_image_2");
    expect(result?.displayName).toBe("Seedream 4.0");
    expect(result?.priceVersionId).toBe("pv_2");
  });

  it("filters out candidates that lack required capabilities", async () => {
    // If only model_image_3 was available besides model_image_1, it should be filtered out
    // because it doesn't support 9:16 or referenceImages
    const result = await findCompatibleAlternativeModel({
      modality: "IMAGE",
      currentModelId: "model_image_2",
      excludeCurrentModel: true,
      requiredAspectRatio: "9:16",
      requireReferenceImages: true,
    });

    expect(result).not.toBeNull();
    expect(result?.modelId).toBe("model_image_1");
  });

  it("returns null when no compatible model exists", async () => {
    const result = await findCompatibleAlternativeModel({
      modality: "IMAGE",
      currentModelId: "model_image_1",
      requiredAspectRatio: "21:9", // none support 21:9 in our mock
    });

    expect(result).toBeNull();
  });

  it("routes frame-to-video to a Seedance model instead of OmniHuman", async () => {
    const result = await findCompatibleAlternativeModel({
      modality: "VIDEO",
      currentModelId: "model_image_1",
      requiredAspectRatio: "adaptive",
      requiredResolution: "720p",
      requireFirstFrame: true,
      requireReturnLastFrame: true,
    });

    expect(result).not.toBeNull();
    expect(result?.providerModelId).toBe("dreamina-seedance-2-0-fast-260128");
    expect(result?.modelId).toBe("model_video_fast");
  });

  it("uses deterministic preferred ordering instead of database row order", async () => {
    const result = await findCompatibleAlternativeModel({
      modality: "VIDEO",
      requiredAspectRatio: "adaptive",
      requiredResolution: "720p",
      requireReturnLastFrame: true,
    });

    expect(result?.providerModelId).toBe("dreamina-seedance-2-0-fast-260128");
  });
});
