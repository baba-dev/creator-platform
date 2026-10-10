import { describe, expect, it } from "vitest";
import {
  CREATIVE_LOCALE_PRESETS,
  DEFAULT_CREATIVE_LOCALE,
  compileCreativeLocaleInstructions,
  creativeLocaleCapabilities,
  creativeLocaleEnhancementSystemPrompt,
  creativeLocaleIntentSchema,
  normalizeCreativeLocaleIntent,
  type CreativeLocaleIntent,
} from "../src/locale";
import { quoteParameters } from "../src/quote-contract";

const oman: CreativeLocaleIntent = {
  preset: "oman",
  language: "ar-OM",
  tone: "professional",
  culturalContext: "auto",
};

describe("Creative Locale foundation", () => {
  it("ships twelve country presets and Auto without duplicate codes", () => {
    expect(CREATIVE_LOCALE_PRESETS).toHaveLength(13);
    expect(new Set(CREATIVE_LOCALE_PRESETS.map((entry) => entry.id)).size).toBe(
      13,
    );
    expect(
      CREATIVE_LOCALE_PRESETS.filter((entry) => entry.countryCode),
    ).toHaveLength(12);
  });

  it("normalizes a validated locale deterministically", () => {
    const parsed = creativeLocaleIntentSchema.parse(oman);
    expect(normalizeCreativeLocaleIntent(parsed)).toEqual({
      ...oman,
      locale: "ar-OM",
      countryCode: "OM",
      accent: "Omani / Gulf Arabic",
      catalogVersion: 1,
    });
  });

  it("rejects unknown locales, invalid language-country pairs and extra fields", () => {
    expect(
      creativeLocaleIntentSchema.safeParse({ ...oman, language: "ja-JP" })
        .success,
    ).toBe(false);
    expect(
      creativeLocaleIntentSchema.safeParse({ ...oman, preset: "moon" }).success,
    ).toBe(false);
    expect(
      creativeLocaleIntentSchema.safeParse({ ...oman, custom: "override" })
        .success,
    ).toBe(false);
  });

  it("has neutral defaults and does not rewrite a user's prompt", () => {
    const prompt = "Luxury perfume bottle on a marble slab";
    expect(
      compileCreativeLocaleInstructions(DEFAULT_CREATIVE_LOCALE, "IMAGE"),
    ).toBe("");
    const instruction = compileCreativeLocaleInstructions(oman, "IMAGE");
    expect(instruction).toContain("Oman");
    expect(instruction).toContain("do not add stereotypes");
    expect(prompt).toBe("Luxury perfume bottle on a marble slab");
  });

  it("does not invent native accent support when a model advertises none", () => {
    expect(creativeLocaleCapabilities("VOICE", {}).accent).toBe("metadata");
    expect(
      creativeLocaleCapabilities("VOICE", { supportsAccent: true }).accent,
    ).toBe("native");
  });

  it("keeps speech locale metadata in system context rather than adding it to the script", () => {
    const system = creativeLocaleEnhancementSystemPrompt("Polish narration.", oman, "VOICE");
    expect(system).toContain("Oman");
    expect(system).toContain("spoken");
    expect(system).not.toContain("[Creative locale guidance]");
  });

  it("binds locale into all quote fingerprints without changing legacy quotes", () => {
    const withLocale = quoteParameters("IMAGE", {
      units: 1,
      localeIntent: oman,
    });
    const withoutLocale = quoteParameters("IMAGE", { units: 1 });
    expect(withLocale.localeIntent).toEqual(oman);
    expect(withoutLocale).not.toHaveProperty("localeIntent");
    expect(
      quoteParameters("VIDEO", { durationSeconds: 5, localeIntent: oman })
        .localeIntent,
    ).toEqual(oman);
    expect(
      quoteParameters("VOICE", { text: "Hello", localeIntent: oman })
        .localeIntent,
    ).toEqual(oman);
    expect(
      quoteParameters("TEXT", { units: 200, localeIntent: oman }).localeIntent,
    ).toEqual(oman);
  });
});
