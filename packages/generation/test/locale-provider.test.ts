import { describe, expect, it } from "vitest";
import {
  compileCreativeLocaleMediaPrompt,
  localeSystemMessages,
  readCreativeLocaleIntent,
  sortVoicesForLocale,
  transcriptionLanguageHint,
  voiceLocaleMatch,
} from "../src/locale";
import { quoteParameters } from "../src/quote-contract";

const oman = {
  preset: "oman" as const,
  language: "ar-OM",
  tone: "professional" as const,
  culturalContext: "auto" as const,
};
const persisted = {
  ...oman,
  countryCode: "OM",
  accent: "Omani / Gulf Arabic",
  catalogVersion: 1,
};

describe("Provider-aware creative locale", () => {
  it("reads normalized snapshots but rejects arbitrary/stale properties", () => {
    expect(readCreativeLocaleIntent(persisted)).toEqual(oman);
    expect(
      readCreativeLocaleIntent({ ...oman, language: "ja-JP" }),
    ).toBeUndefined();
    expect(readCreativeLocaleIntent(null)).toBeUndefined();
    expect(readCreativeLocaleIntent([])).toBeUndefined();
  });

  it("compiles media direction exactly once at provider submission without editing original", () => {
    const original = "A pearl-white car in a bright showroom.";
    const compiled = compileCreativeLocaleMediaPrompt(
      original,
      persisted,
      "IMAGE",
    );
    expect(compiled).toContain(original);
    expect(compiled).toContain("[Creative locale guidance]");
    expect(compiled).toContain("Oman (ar-OM)");
    expect(original).not.toContain("Oman");
    expect(compileCreativeLocaleMediaPrompt(original, undefined, "IMAGE")).toBe(
      original,
    );
  });

  it("preserves tone with automatic country without inventing a region", () => {
    const autoWarm = {
      preset: "auto" as const,
      language: "auto",
      tone: "warm" as const,
      culturalContext: "auto" as const,
    };
    const result = compileCreativeLocaleMediaPrompt(
      "A simple greeting",
      autoWarm,
      "VIDEO",
    );
    expect(result).toContain("Requested tone: warm");
    expect(result).not.toContain("Target audience locale: Auto");
  });

  it("never truncates a user prompt to make room for locale guidance", () => {
    const long = "a".repeat(1990);
    expect(compileCreativeLocaleMediaPrompt(long, persisted, "VIDEO")).toBe(
      long,
    );
    expect(
      compileCreativeLocaleMediaPrompt("voice", persisted, "VOICE", 20),
    ).toBe("voice");
  });

  it("injects one transient system message per request, not into saved chat turns", () => {
    const original = [
      { role: "user" as const, content: "Write a short poem." },
    ];
    const compiled = localeSystemMessages(original, persisted);
    expect(compiled).toHaveLength(2);
    expect(compiled[0]?.role).toBe("system");
    expect(compiled[0]?.content).toContain("Never echo the locale metadata");
    expect(compiled[1]).toEqual(original[0]);
    expect(original).toHaveLength(1);
    expect(original[0]?.content).toBe("Write a short poem.");
    expect(localeSystemMessages(original, undefined)).toEqual(original);
  });

  it("ranks exact verified locale ahead of same-language without inventing accents", () => {
    const voices = [
      { key: "us", locale: "en-US" },
      { key: "eg", locale: "ar-EG" },
      { key: "om", locale: "ar-OM" },
    ];
    expect(
      sortVoicesForLocale(voices, persisted).map((voice) => voice.key),
    ).toEqual(["om", "eg", "us"]);
    expect(voices[0]?.key).toBe("us");
    expect(voiceLocaleMatch("ar-EG", "ar-OM")).toBe("language");
    expect(voiceLocaleMatch("en-US", "ar-OM")).toBe("unverified");
    expect(voiceLocaleMatch("ar-OM", "ar-OM")).toBe("exact");
  });

  it("uses explicit transcription language first, otherwise ISO language subtag", () => {
    expect(transcriptionLanguageHint(undefined, persisted)).toBe("ar");
    expect(transcriptionLanguageHint("en", persisted)).toBe("en");
    expect(transcriptionLanguageHint(undefined, undefined)).toBeUndefined();
  });

  it("binds changed locale into Seed Audio quote context", () => {
    const one = quoteParameters("VOICE", {
      task: "seed-audio",
      text: "test",
      estimatedDurationSeconds: 30,
      localeIntent: oman,
    });
    const other = quoteParameters("VOICE", {
      task: "seed-audio",
      text: "test",
      estimatedDurationSeconds: 30,
      localeIntent: { ...oman, tone: "warm" },
    });
    expect(one.localeIntent).toEqual(oman);
    expect(other.localeIntent).not.toEqual(one.localeIntent);
  });
});
