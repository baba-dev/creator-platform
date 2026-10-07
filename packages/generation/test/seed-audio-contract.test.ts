import { describe, expect, it } from "vitest";
import { seedAudioRequestSchema } from "../src";

const base = {
  task: "seed-audio" as const,
  organizationId: "org-1",
  modelId: "model-1",
  priceVersionId: "price-1",
  idempotencyKey: "11111111-1111-4111-8111-111111111111",
  textPrompt: "A warm documentary narration.",
};

describe("Seed Audio request contract", () => {
  it("accepts the provider output formats and full sample-rate matrix", () => {
    for (const format of ["wav", "mp3", "pcm", "ogg_opus"] as const) {
      for (const sampleRate of [8000, 16000, 24000, 32000, 44100, 48000]) {
        expect(
          seedAudioRequestSchema.safeParse({ ...base, format, sampleRate })
            .success,
        ).toBe(true);
      }
    }
  });

  it("accepts saved voices but caps all audio references at three", () => {
    expect(
      seedAudioRequestSchema.safeParse({
        ...base,
        referenceVoiceKeys: ["russell", "joanne", "dacey"],
      }).success,
    ).toBe(true);
    expect(
      seedAudioRequestSchema.safeParse({
        ...base,
        referenceAudioAssetIds: ["a1", "a2"],
        referenceVoiceKeys: ["russell", "joanne"],
      }).success,
    ).toBe(false);
  });

  it("keeps image references mutually exclusive with audio and saved voices", () => {
    expect(
      seedAudioRequestSchema.safeParse({
        ...base,
        referenceImageAssetId: "image-1",
        referenceVoiceKeys: ["russell"],
      }).success,
    ).toBe(false);
  });
});
