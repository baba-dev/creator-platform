import { describe, expect, it } from "vitest";

import {
  generationKinds,
  getShowcaseModels,
  showcaseModels,
} from "./showcase-models";

describe("showcase model catalog", () => {
  it("covers every launch media workflow", () => {
    for (const kind of generationKinds) {
      expect(getShowcaseModels(kind).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps generation models on the BytePlus boundary", () => {
    expect(showcaseModels.every((model) => model.provider === "BytePlus")).toBe(
      true,
    );
  });

  it("uses explicit integer credit strings for display-only rates", () => {
    for (const model of showcaseModels) {
      expect(model.demoCredits).toMatch(/^\d+$/);
      expect(model.demoRate).toContain("credits");
    }
  });
});
