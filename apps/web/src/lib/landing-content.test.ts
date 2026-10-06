import { describe, expect, it } from "vitest";

import {
  landingFeatureGroups,
  landingStudioModes,
  reasoningProviders,
} from "./landing-content";

describe("public landing content", () => {
  it("covers every public media studio mode", () => {
    expect(landingStudioModes.map((mode) => mode.id)).toEqual([
      "image",
      "video",
      "voice",
      "spokesperson",
    ]);
    expect(landingStudioModes.every((mode) => mode.models.length > 0)).toBe(
      true,
    );
  });

  it("markets the complete primary creative workspace", () => {
    const titles = landingFeatureGroups.flatMap((group) =>
      group.features.map((feature) => feature.title),
    );

    for (const title of [
      "Image Studio",
      "AI Retouch & Canvas",
      "PSD Multi-Layer Studio",
      "Pixel Editor",
      "Video Studio",
      "AI Spokesperson",
      "Multi-Clip Editor",
      "Voice & Speech Studio",
      "Voice Casting Booth",
      "Realtime Voice Persona",
      "Pixel AI",
      "Creative Director",
      "Scriptwriter",
      "Brand & Story Assistants",
      "Story Planner",
      "Generation Templates",
      "Projects",
      "Asset Library",
      "Generation History",
      "Bring your own storage",
      "Organizations & members",
      "Credits & wallet",
      "Payments",
      "Model & pricing control",
    ]) {
      expect(titles).toContain(title);
    }
  });

  it("shows the enabled reasoning provider families used by discovery", () => {
    expect(reasoningProviders).toEqual([
      "BytePlus",
      "NVIDIA",
      "Groq",
      "Gemini",
      "Cloudflare",
    ]);
  });
});
