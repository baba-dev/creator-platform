import { describe, expect, it } from "vitest";

import {
  capabilityValues,
  referenceCapabilityLabel,
  resolutionLabel,
  selectSupportedCapability,
} from "./studio-model-capabilities";

const seedream40 = {
  "resolution:1K": true,
  "resolution:2K": true,
  "resolution:4K": true,
  "aspectRatio:1:1": true,
  "aspectRatio:16:9": true,
  referenceImages: true,
  maxReferenceImages: 14,
};

describe("Studio model capabilities", () => {
  it("keeps valid selections and prefers 2K when switching from unsupported 3K", () => {
    expect(
      selectSupportedCapability(seedream40, "resolution", "4K", ["2K"]),
    ).toBe("4K");
    expect(
      selectSupportedCapability(seedream40, "resolution", "3K", ["2K"]),
    ).toBe("2K");
  });

  it("preserves capability order for display while supporting 1K", () => {
    expect(capabilityValues(seedream40, "resolution")).toEqual([
      "1K",
      "2K",
      "4K",
    ]);
    expect(resolutionLabel("1K")).toBe("1K · Compact");
  });

  it("never invents a reference-image maximum", () => {
    expect(referenceCapabilityLabel(seedream40)).toBe("Up to 14 references");
    expect(referenceCapabilityLabel({ referenceImages: true })).toBe(
      "Reference images supported",
    );
    expect(referenceCapabilityLabel({ referenceImages: false })).toBeNull();
  });
});
