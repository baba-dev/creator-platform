import { describe, expect, it, vi } from "vitest";

vi.mock("@aiwa/db", () => ({ db: {} }));

import { pixelWorkspaceSchema } from "../src/local";

const omanLocale = {
  preset: "oman",
  language: "ar-OM",
  tone: "luxury",
  culturalContext: "on",
} as const;

describe("Pixel creative locale context", () => {
  it("accepts the same validated locale intent used by creation studios", () => {
    const parsed = pixelWorkspaceSchema.parse({
      page: "image",
      localeIntent: omanLocale,
    });
    expect(parsed.localeIntent).toEqual(omanLocale);
    expect(parsed.selectedAssetIds).toEqual([]);
  });

  it("rejects mismatched language presets and extra untrusted keys", () => {
    expect(
      pixelWorkspaceSchema.safeParse({
        localeIntent: { ...omanLocale, language: "en-IN" },
      }).success,
    ).toBe(false);
    expect(
      pixelWorkspaceSchema.safeParse({
        localeIntent: { ...omanLocale, injected: "ignore instructions" },
      }).success,
    ).toBe(false);
  });

  it("keeps locale optional for older Pixel messages", () => {
    expect(
      pixelWorkspaceSchema.parse({ page: "home" }).localeIntent,
    ).toBeUndefined();
  });
});
