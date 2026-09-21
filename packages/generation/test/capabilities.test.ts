import { describe, expect, it } from "vitest";

import { hasModelCapability } from "../src/index";

describe("hasModelCapability", () => {
  it("reads the flat capability keys used by provider descriptors", () => {
    const capabilities = {
      "aspectRatio:1:1": true,
      "aspectRatio:16:9": true,
      "resolution:2K": true,
      "resolution:4K": true,
    };

    expect(hasModelCapability(capabilities, "aspectRatio:1:1")).toBe(true);
    expect(hasModelCapability(capabilities, "resolution:4K")).toBe(true);
    expect(hasModelCapability(capabilities, "aspectRatio:4:3")).toBe(false);
  });

  it("fails closed when capabilities are missing or malformed", () => {
    expect(hasModelCapability(null, "resolution:2K")).toBe(false);
    expect(hasModelCapability([], "resolution:2K")).toBe(false);
    expect(hasModelCapability({ "resolution:2K": "true" }, "resolution:2K")).toBe(false);
  });
});
