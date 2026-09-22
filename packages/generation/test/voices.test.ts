import { describe, expect, it } from "vitest";
import {
  listPublicPresetVoices,
  resolvePresetVoice,
  VERIFIED_PRESET_VOICES,
  VoiceResolutionError,
} from "../src/voices";

describe("preset voice catalogue", () => {
  it("resolves verified preset voice keys to provider speaker IDs", () => {
    const voice = resolvePresetVoice("jasper", "seed-tts-2.0");
    expect(voice.key).toBe("jasper");
    expect(voice.speakerId).toBe("en_male_excited-male-voice_uranus_bigtts");
    expect(voice.locale).toBe("en-US");
    expect(voice.gender).toBe("male");
  });

  it("handles case-insensitive and trimmed voice keys", () => {
    const voice = resolvePresetVoice("  CHARLOTTE  ", "seed-tts-2.0");
    expect(voice.key).toBe("charlotte");
    expect(voice.speakerId).toBe(
      "en_female_authoritative-british_uranus_bigtts",
    );
  });

  it("rejects unknown voice keys", () => {
    expect(() => resolvePresetVoice("unknown_voice", "seed-tts-2.0")).toThrow(
      VoiceResolutionError,
    );
  });

  it("rejects voices for incompatible models", () => {
    expect(() => resolvePresetVoice("jasper", "incompatible-model")).toThrow(
      VoiceResolutionError,
    );
  });

  it("lists public preset voices without exposing raw speaker IDs", () => {
    const publicVoices = listPublicPresetVoices("seed-tts-2.0");
    expect(publicVoices.length).toBeGreaterThan(0);
    for (const voice of publicVoices) {
      expect(voice).toHaveProperty("key");
      expect(voice).toHaveProperty("displayName");
      expect(voice).toHaveProperty("locale");
      expect(voice).not.toHaveProperty("speakerId");
    }
  });

  it("contains all verified default presets", () => {
    const keys = VERIFIED_PRESET_VOICES.map((v) => v.key);
    expect(keys).toContain("jasper");
    expect(keys).toContain("charlotte");
    expect(keys).toContain("kayla");
    expect(keys).toContain("sunny");
    expect(keys).toContain("zendaya");
    expect(keys).toContain("sharron");
    expect(keys).toContain("vivi");
    expect(keys).toContain("xiaohe");
  });
});
