import { describe, expect, it } from "vitest";

import { getProviderRuntimeReadiness } from "./provider-readiness";

describe("provider runtime readiness", () => {
  it("requires the correct BytePlus credential family", () => {
    expect(
      getProviderRuntimeReadiness(
        {
          provider: "BYTEPLUS",
          mediaKind: "TEXT",
          providerModelId: "seed-2-0-lite-260428",
        },
        { BYTEPLUS_API_KEY: "key" },
      ).configured,
    ).toBe(true);

    expect(
      getProviderRuntimeReadiness(
        {
          provider: "BYTEPLUS",
          mediaKind: "VOICE",
          providerModelId: "seed-tts-2.0",
        },
        { BYTEPLUS_API_KEY: "key" },
      ).configured,
    ).toBe(false);

    expect(
      getProviderRuntimeReadiness(
        {
          provider: "BYTEPLUS",
          mediaKind: "VOICE",
          providerModelId: "seed-tts-2.0",
        },
        { BYTEPLUS_SPEECH_API_KEY: "speech" },
      ).configured,
    ).toBe(true);
  });

  it("requires both OmniHuman vision credentials", () => {
    const input = {
      provider: "BYTEPLUS",
      mediaKind: "VIDEO",
      providerModelId: "omnihuman-1.5",
    };
    expect(
      getProviderRuntimeReadiness(input, {
        BYTEPLUS_VISION_ACCESS_KEY_ID: "id",
      }).configured,
    ).toBe(false);
    expect(
      getProviderRuntimeReadiness(input, {
        BYTEPLUS_VISION_ACCESS_KEY_ID: "id",
        BYTEPLUS_VISION_SECRET_ACCESS_KEY: "secret",
      }).configured,
    ).toBe(true);
  });

  it("requires provider-specific external credentials", () => {
    expect(
      getProviderRuntimeReadiness(
        {
          provider: "GROQ",
          mediaKind: "TEXT",
          providerModelId: "openai/gpt-oss-20b",
        },
        { GROQ_API_KEY: "key" },
      ).configured,
    ).toBe(true);
    expect(
      getProviderRuntimeReadiness(
        {
          provider: "GEMINI",
          mediaKind: "TEXT",
          providerModelId: "gemini-3.5-flash-lite",
        },
        {},
      ).configured,
    ).toBe(false);
  });

  it("requires both Cloudflare token and account id", () => {
    const input = {
      provider: "CLOUDFLARE",
      mediaKind: "TEXT",
      providerModelId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    };
    expect(
      getProviderRuntimeReadiness(input, {
        CLOUDFLARE_API_TOKEN: "token",
      }).configured,
    ).toBe(false);
    expect(
      getProviderRuntimeReadiness(input, {
        CLOUDFLARE_API_TOKEN: "token",
        CLOUDFLARE_ACCOUNT_ID: "account",
      }).configured,
    ).toBe(true);
  });
  it("hides NVIDIA text models unless licensed, but retains the existing reasoning model", () => {
    const textModel = {
      provider: "NVIDIA",
      mediaKind: "TEXT",
      providerModelId: "nvidia/nemotron-3.5-lightning-30b-a3b",
    };
    const reasoningModel = {
      provider: "NVIDIA",
      mediaKind: "REASONING",
      providerModelId: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    };
    expect(getProviderRuntimeReadiness(textModel, { NVIDIA_API_KEY: "key" }).configured).toBe(false);
    expect(getProviderRuntimeReadiness(textModel, {
      NVIDIA_API_KEY: "key",
      NVIDIA_COMMERCIAL_USE_ENABLED: "true",
    }).configured).toBe(true);
    expect(getProviderRuntimeReadiness(reasoningModel, { NVIDIA_API_KEY: "key" }).configured).toBe(true);
  });

});
