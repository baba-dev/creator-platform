import { describe, expect, it } from "vitest";

import {
  deriveGenerationExperience,
  formatEta,
  percentile,
} from "./generation-experience";

describe("generation experience", () => {
  it("uses a deterministic nearest-rank percentile", () => {
    expect(percentile([10, 20, 30, 40], 0.75)).toBe(30);
    expect(percentile([], 0.75)).toBeNull();
  });

  it("learns a p75 ETA from successful historical durations", () => {
    const experience = deriveGenerationExperience({
      status: "PROCESSING",
      kind: "IMAGE",
      queuedAt: new Date(0),
      nowMs: 20_000,
      historicalDurationsMs: [30_000, 35_000, 40_000, 50_000, 55_000],
    });
    expect(experience.stage).toBe("CREATING");
    expect(experience.etaConfidence).toBe("MEDIUM");
    expect(experience.etaSeconds).toBe(30);
  });

  it("stops counting down when the job exceeds the normal range", () => {
    const experience = deriveGenerationExperience({
      status: "PROCESSING",
      kind: "VIDEO",
      queuedAt: new Date(0),
      nowMs: 200_000,
      historicalDurationsMs: [80_000, 90_000, 100_000, 110_000, 120_000],
    });
    expect(experience.stage).toBe("DELAYED");
    expect(experience.etaSeconds).toBeNull();
    expect(experience.delayed).toBe(true);
  });

  it("uses a friendly provider error description for failed generations", () => {
    const experience = deriveGenerationExperience({
      status: "FAILED",
      kind: "IMAGE",
      queuedAt: new Date(0),
      errorCode: "OutputImageSensitiveContentDetected",
      errorMessage: "Provider rejected the image request. Credits released.",
    });
    expect(experience.stage).toBe("FAILED");
    expect(experience.title).toBe(
      "Generated image was blocked by the safety filter",
    );
    expect(experience.description).toContain(
      "even when the prompt itself is acceptable",
    );
  });

  it("does not expose an ETA for terminal states", () => {
    const experience = deriveGenerationExperience({
      status: "MANUAL_REVIEW",
      kind: "VIDEO",
      queuedAt: new Date(0),
      errorMessage: "Provider result needs review.",
    });
    expect(experience.terminal).toBe(true);
    expect(experience.etaSeconds).toBeNull();
    expect(experience.description).toBe("Provider result needs review.");
  });

  it("uses intentionally coarse copy while confidence is low", () => {
    expect(formatEta(42, "LOW")).toBe("Usually ready within a minute");
    expect(formatEta(61, "LOW")).toBe("Usually ready in about 2 min");
  });
});
