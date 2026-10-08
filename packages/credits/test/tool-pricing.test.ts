import { describe, expect, it } from "vitest";
import {
  mediaToolResolutionRate,
  quoteProviderToolPrice,
} from "../src/tool-pricing";

describe("provider tool pricing", () => {
  const base = {
    exchangeRate: { baisaNumerator: 769n, baisaDenominator: 2n },
    targetGrossMarginBps: 2000,
    creditsPerBaisa: 1n,
  } as const;

  it("prices request tools as a single immutable unit", () => {
    const quote = quoteProviderToolPrice({
      ...base,
      providerCostMicroUsd: 10_000n,
      pricingMetric: "REQUEST",
      unitQuantity: 1,
      billableQuantity: 1,
    });
    expect(quote.billableUnits).toBe(1n);
    expect(quote.providerCostMicroUsd).toBe(10_000n);
    expect(quote.customerCredits).toBeGreaterThan(0n);
  });

  it("rounds second-based billing up to configured blocks", () => {
    const quote = quoteProviderToolPrice({
      ...base,
      providerCostMicroUsd: 6_000n,
      pricingMetric: "OUTPUT_SECOND",
      unitQuantity: 10,
      billableQuantity: 11,
    });
    expect(quote.billableUnits).toBe(2n);
    expect(quote.providerCostMicroUsd).toBe(12_000n);
  });

  it("rejects request pricing with scalable quantities", () => {
    expect(() =>
      quoteProviderToolPrice({
        ...base,
        providerCostMicroUsd: 1n,
        pricingMetric: "REQUEST",
        unitQuantity: 1,
        billableQuantity: 2,
      }),
    ).toThrow(/REQUEST-priced/);
  });

  it("prorates processed bytes instead of charging a whole GiB", () => {
    const quote = quoteProviderToolPrice({
      ...base,
      pricingMetric: "INPUT_BYTE",
      providerCostMicroUsd: 10000n,
      unitQuantity: 1073741824,
      billableQuantity: 1048576,
      proportional: true,
    });
    expect(quote.providerCostMicroUsd).toBe(10n);
    expect(quote.customerCredits).toBe(2n);
  });

  it("settles millisecond video usage with integer arithmetic", () => {
    const quote = quoteProviderToolPrice({
      ...base,
      pricingMetric: "OUTPUT_SECOND",
      providerCostMicroUsd: 300000n,
      unitQuantity: 60,
      billableQuantity: 15500,
      billableQuantityDenominator: 1000n,
      proportional: true,
    });
    expect(quote.providerCostMicroUsd).toBe(77500n);
    expect(quote.billableUnits).toBe(1n);
  });

  it("maps provider resolution labels to ceiling tariffs without guessing 8K", () => {
    const rates = {
      "720p": "300000",
      "1080p": "450000",
      "1440p": "900000",
      "2160p": "1200000",
    };
    expect(mediaToolResolutionRate(rates, "540p")).toBe(300000n);
    expect(mediaToolResolutionRate(rates, "1080P")).toBe(450000n);
    expect(mediaToolResolutionRate(rates, "2k")).toBe(900000n);
    expect(mediaToolResolutionRate(rates, "4k")).toBe(1200000n);
    expect(mediaToolResolutionRate(rates, "8k")).toBeNull();
    expect(mediaToolResolutionRate(rates, undefined)).toBeNull();
  });
});
