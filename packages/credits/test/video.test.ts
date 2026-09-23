import { describe, expect, it } from "vitest";
import {
  calculateVideoPricing,
  getResolutionMultiplierBps,
  getAudioMultiplierBps,
  getWorstSupportedVideoCase,
  assertFlatVideoPriceCoversWorstCase,
} from "../src/video";

describe("video pricing policy", () => {
  it("resolves resolution and audio basis points correctly", () => {
    expect(getResolutionMultiplierBps("720p")).toBe(10_000n);
    expect(getResolutionMultiplierBps("1080p")).toBe(15_000n);
    expect(getResolutionMultiplierBps(undefined)).toBe(10_000n);
    expect(getAudioMultiplierBps(false)).toBe(10_000n);
    expect(getAudioMultiplierBps(true)).toBe(12_000n);
  });

  it("computes base 5s 720p without audio at standard rate", () => {
    const result = calculateVideoPricing({
      providerCostMicroUsd: 468_000n,
      durationSeconds: 5,
      resolution: "720p",
      generateAudio: false,
      pricingDimension: "SECOND",
      unitQuantity: 5,
    });

    expect(result.durationUnits).toBe(1n);
    expect(result.resolutionBps).toBe(10_000n);
    expect(result.audioBps).toBe(10_000n);
    expect(result.scaledProviderCostMicroUsd).toBe(468_000n);
    expect(result.quote.customerCredits).toBe(240n);
  });

  it("scales proportionally for 10s video (2 billing blocks)", () => {
    const result = calculateVideoPricing({
      providerCostMicroUsd: 468_000n,
      durationSeconds: 10,
      resolution: "720p",
      generateAudio: false,
      pricingDimension: "SECOND",
      unitQuantity: 5,
    });

    expect(result.durationUnits).toBe(2n);
    expect(result.scaledProviderCostMicroUsd).toBe(936_000n);
    expect(result.quote.customerCredits).toBe(480n);
  });

  it("rounds up partial units (e.g. 7s into 5s unit = 2 units)", () => {
    const result = calculateVideoPricing({
      providerCostMicroUsd: 468_000n,
      durationSeconds: 7,
      resolution: "720p",
      generateAudio: false,
      pricingDimension: "SECOND",
      unitQuantity: 5,
    });

    expect(result.durationUnits).toBe(2n);
    expect(result.quote.customerCredits).toBe(480n);
  });

  it("applies 1080p resolution multiplier (1.5x / 15000 bps)", () => {
    const result = calculateVideoPricing({
      providerCostMicroUsd: 468_000n,
      durationSeconds: 5,
      resolution: "1080p",
      generateAudio: false,
      pricingDimension: "SECOND",
      unitQuantity: 5,
    });

    expect(result.resolutionBps).toBe(15_000n);
    expect(result.scaledProviderCostMicroUsd).toBe(702_000n);
    expect(result.quote.customerCredits).toBe(360n);
  });

  it("applies audio multiplier (1.2x / 12000 bps)", () => {
    const result = calculateVideoPricing({
      providerCostMicroUsd: 468_000n,
      durationSeconds: 5,
      resolution: "720p",
      generateAudio: true,
      pricingDimension: "SECOND",
      unitQuantity: 5,
    });

    expect(result.audioBps).toBe(12_000n);
    expect(result.scaledProviderCostMicroUsd).toBe(561_600n);
    expect(result.quote.customerCredits).toBe(288n);
  });

  it("compounds duration, resolution, and audio multipliers with integer arithmetic", () => {
    // 10s (2 units) * 1080p (1.5x) * audio (1.2x) = 3.6x base cost
    const result = calculateVideoPricing({
      providerCostMicroUsd: 468_000n,
      durationSeconds: 10,
      resolution: "1080p",
      generateAudio: true,
      pricingDimension: "SECOND",
      unitQuantity: 5,
    });

    expect(result.durationUnits).toBe(2n);
    expect(result.scaledProviderCostMicroUsd).toBe(1_684_800n);
    expect(result.quote.customerCredits).toBe(864n);
  });

  it("handles flat REQUEST dimension for backward compatibility", () => {
    const result = calculateVideoPricing({
      providerCostMicroUsd: 468_000n,
      durationSeconds: 10,
      resolution: "1080p",
      generateAudio: true,
      pricingDimension: "REQUEST",
    });

    expect(result.durationUnits).toBe(1n);
    expect(result.scaledProviderCostMicroUsd).toBe(468_000n);
    expect(result.quote.customerCredits).toBe(240n);
  });

  it("calculates worst supported video case correctly from capabilities", () => {
    const capabilities = {
      maximumDurationSeconds: 10,
      "durationSeconds:5": true,
      "durationSeconds:10": true,
      "resolution:720p": true,
      "resolution:1080p": true,
      generateAudio: true,
    };

    const worstCase = getWorstSupportedVideoCase(capabilities, 5);
    expect(worstCase.maxDurationSeconds).toBe(10);
    expect(worstCase.maxResolution).toBe("1080p");
    expect(worstCase.supportsAudio).toBe(true);
    // 2 units * 1.5 * 1.2 = 3.6 = 36000 bps
    expect(worstCase.worstCaseMultiplierBps).toBe(36_000n);
  });

  it("validates flat pricing covers worst case or throws", () => {
    const capabilities = {
      maximumDurationSeconds: 10,
      "resolution:1080p": true,
      generateAudio: true,
    };
    const baseCost = 468_000n; // 5s 720p cost

    // Worst case requires at least 3.6 * 468_000 = 1_684_800
    expect(() => {
      assertFlatVideoPriceCoversWorstCase(468_000n, baseCost, capabilities, 5);
    }).toThrow(/does not cover worst supported case/);

    expect(() => {
      assertFlatVideoPriceCoversWorstCase(
        1_684_800n,
        baseCost,
        capabilities,
        5,
      );
    }).not.toThrow();
  });
});
