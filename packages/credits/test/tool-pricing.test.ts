import { describe, expect, it } from "vitest";
import { quoteProviderToolPrice } from "../src/tool-pricing";

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
});
