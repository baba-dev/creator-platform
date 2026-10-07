import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRESET_VOICE_KEY,
  listPublicPresetVoices,
  resolvePresetVoice,
  VERIFIED_PRESET_VOICES,
  VoiceResolutionError,
} from "../src/voices";

describe("preset voice catalogue", () => {
  it("uses a neutral general-purpose voice as the platform fallback", () => {
    expect(DEFAULT_PRESET_VOICE_KEY).toBe("russell");
    const voice = resolvePresetVoice(DEFAULT_PRESET_VOICE_KEY, "seed-tts-2.0");
    expect(voice.speakerId).toBe("en_male_russell_uranus_bigtts");
    expect(voice.scenario).toBe("General");
  });

  it("resolves verified preset voice keys to provider speaker IDs", () => {
    const voice = resolvePresetVoice("jasper", "seed-tts-2.0");
    expect(voice.key).toBe("jasper");
    expect(voice.speakerId).toBe("en_male_excited-male-voice_uranus_bigtts");
    expect(voice.locale).toBe("en-US");
    expect(voice.gender).toBe("male");
  });

  it("handles case-insensitive and trimmed voice keys", () => {
    const voice = resolvePresetVoice("  CHARLOTTE  ");
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
    expect(() => resolvePresetVoice("russell", "incompatible-model")).toThrow(
      VoiceResolutionError,
    );
  });

  it("lists public preset voices without exposing raw speaker IDs", () => {
    const publicVoices = listPublicPresetVoices("seed-tts-2.0");
    expect(publicVoices.length).toBeGreaterThanOrEqual(20);
    expect(publicVoices[0]?.key).toBe("russell");
    for (const voice of publicVoices) {
      expect(voice).toHaveProperty("key");
      expect(voice).toHaveProperty("displayName");
      expect(voice).toHaveProperty("locale");
      expect(voice).not.toHaveProperty("speakerId");
    }
  });

  it("includes expanded neutral, Arabic, and existing presets", () => {
    const keys = VERIFIED_PRESET_VOICES.map((voice) => voice.key);
    for (const key of [
      "russell",
      "tim",
      "dacey",
      "joanne",
      "skye",
      "jimmy",
      "dina",
      "youssef",
      "jasper",
      "charlotte",
      "kayla",
      "sunny",
      "zendaya",
      "sharron",
      "vivi",
      "xiaohe",
    ]) {
      expect(keys).toContain(key);
    }
  });
});
