import { describe, expect, it } from "vitest";

import { selectQuickCreateModel } from "./quick-create-model";

describe("Quick Create model selection", () => {
  it("prefers Seedream 5.0 Lite for images", () => {
    const selected = selectQuickCreateModel(
      [
        { providerModelId: "seedream-4-0-250828" },
        { providerModelId: "seedream-5-0-260128" },
      ],
      "IMAGE",
    );

    expect(selected?.providerModelId).toBe("seedream-5-0-260128");
  });

  it("prefers prompt-to-video and skips talking avatars", () => {
    const selected = selectQuickCreateModel(
      [
        {
          providerModelId: "omnihuman-1.5",
          capabilities: { talkingAvatar: true },
        },
        { providerModelId: "dreamina-seedance-2-0-260128" },
        { providerModelId: "dreamina-seedance-2-0-fast-260128" },
      ],
      "VIDEO",
    );

    expect(selected?.providerModelId).toBe("dreamina-seedance-2-0-fast-260128");
  });

  it("falls back to the first compatible model", () => {
    const selected = selectQuickCreateModel(
      [
        {
          providerModelId: "source-only-video",
          capabilities: { talkingAvatar: true },
        },
        { providerModelId: "prompt-video" },
      ],
      "VIDEO",
    );

    expect(selected?.providerModelId).toBe("prompt-video");
  });

  it("returns undefined without a compatible model", () => {
    const selected = selectQuickCreateModel(
      [
        {
          providerModelId: "source-only-video",
          capabilities: { talkingAvatar: true },
        },
      ],
      "VIDEO",
    );

    expect(selected).toBeUndefined();
  });
});
