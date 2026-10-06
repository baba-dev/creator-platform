import { describe, expect, it } from "vitest";

import {
  computeAvailableGenerationActions,
  type ActionAvailabilityModel,
} from "./available-actions";

const imageModel: ActionAvailabilityModel = {
  id: "image-current",
  providerModelId: "seedream-current",
  mediaKind: "IMAGE",
  capabilities: {
    referenceImages: true,
    sequentialImages: true,
    maxGeneratedImages: 15,
    maxTotalInputOutputImages: 15,
    "aspectRatio:9:16": true,
    "aspectRatio:16:9": true,
  },
};

const videoModel: ActionAvailabilityModel = {
  id: "video-standard",
  providerModelId: "seedance-standard",
  mediaKind: "VIDEO",
  capabilities: {
    firstFrame: true,
    extendVideo: true,
  },
};

describe("creative available actions", () => {
  it("advertises only executable image follow-ups", () => {
    const actions = computeAvailableGenerationActions(
      {
        id: "job-1",
        status: "SUCCEEDED",
        assets: [{ mimeType: "image/webp" }],
        providerModel: {
          id: imageModel.id,
          providerModelId: imageModel.providerModelId,
          mediaKind: "IMAGE",
          capabilities: imageModel.capabilities,
        },
      },
      [
        imageModel,
        {
          ...imageModel,
          id: "image-alternate",
          providerModelId: "seedream-alternate",
        },
        videoModel,
      ],
    );

    expect(actions).toEqual([
      "animate",
      "variations",
      "aspect_ratio",
      "edit",
      "switch_model",
    ]);
  });

  it("does not advertise variations at an unsupported inherited resolution", () => {
    const actions = computeAvailableGenerationActions(
      {
        id: "job-resolution",
        status: "SUCCEEDED",
        requestPayload: { aspectRatio: "1:1", resolution: "1K" },
        assets: [{ mimeType: "image/png" }],
        providerModel: {
          id: "image-pro",
          providerModelId: "image-pro",
          mediaKind: "IMAGE",
          capabilities: {
            referenceImages: true,
            "aspectRatio:1:1": true,
            "resolution:1K": true,
          },
        },
      },
      [
        {
          ...imageModel,
          id: "image-sequential",
          providerModelId: "image-sequential",
          capabilities: {
            ...imageModel.capabilities,
            "resolution:2K": true,
          },
        },
      ],
    );

    expect(actions).not.toContain("variations");
  });

  it("does not expose animate or variations when no capable route exists", () => {
    const actions = computeAvailableGenerationActions(
      {
        id: "job-2",
        status: "SUCCEEDED",
        assets: [{ mimeType: "image/png" }],
        providerModel: {
          id: "image-current",
          providerModelId: "image-current",
          mediaKind: "IMAGE",
          capabilities: {},
        },
      },
      [
        {
          id: "image-current",
          providerModelId: "image-current",
          mediaKind: "IMAGE",
          capabilities: {},
        },
        {
          id: "avatar-only",
          providerModelId: "omnihuman",
          mediaKind: "VIDEO",
          capabilities: { talkingAvatar: true, firstFrame: true },
        },
      ],
    );

    expect(actions).toEqual([]);
  });

  it("exposes video extension only when an enabled catalog model supports it", () => {
    expect(
      computeAvailableGenerationActions(
        {
          id: "job-3",
          status: "SUCCEEDED",
          assets: [{ mimeType: "video/mp4" }],
          providerModel: {
            id: "video-current",
            providerModelId: "video-current",
            mediaKind: "VIDEO",
            capabilities: {},
          },
        },
        [videoModel],
      ),
    ).toEqual(["extend", "switch_model"]);
  });

  it("requires an explicit speech-rate capability for voice actions", () => {
    const baseJob = {
      id: "voice-job",
      status: "SUCCEEDED",
      assets: [{ mimeType: "audio/mpeg" }],
    };

    expect(
      computeAvailableGenerationActions(
        {
          ...baseJob,
          providerModel: {
            id: "voice",
            providerModelId: "voice",
            mediaKind: "VOICE",
            capabilities: { speechRate: true },
          },
        },
        [],
      ),
    ).toEqual(["speech_rate"]);

    expect(
      computeAvailableGenerationActions(
        {
          ...baseJob,
          providerModel: {
            id: "voice",
            providerModelId: "voice",
            mediaKind: "VOICE",
            capabilities: {},
          },
        },
        [],
      ),
    ).toEqual([]);
  });
});
