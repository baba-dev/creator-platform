import { describe, expect, it } from "vitest";
import { CHARACTER_PERSONA_PRESETS, getCharacterPersonaPreset } from "./character-persona-presets";

describe("built-in Character Chat personas", () => {
  it("has distinctive quick prompt chips and system instructions for each preset", () => {
    const presets = Object.values(CHARACTER_PERSONA_PRESETS);
    expect(presets).toHaveLength(4);
    expect(new Set(presets.map((preset) => preset.systemPrompt)).size).toBe(presets.length);
    expect(new Set(presets.flatMap((preset) => preset.quickPrompts.map((chip) => chip.prompt))).size)
      .toBe(presets.reduce((sum, preset) => sum + preset.quickPrompts.length, 0));
    expect(presets.every((preset) => preset.quickPrompts.length >= 3)).toBe(true);
  });

  it("never overwrites a custom persona with the same name", () => {
    expect(getCharacterPersonaPreset({ name: "Brand Strategist", isPreset: false })).toBeNull();
    expect(getCharacterPersonaPreset({ name: "Brand Strategist", isPreset: true })?.quickPrompts).toHaveLength(4);
  });
});
