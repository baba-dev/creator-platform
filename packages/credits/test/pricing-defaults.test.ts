import { describe, expect, it } from "vitest";

import {
  calculateModelQuote,
  DEFAULT_CREDITS_PER_BAISA,
  DEFAULT_FX_RATE,
  DEFAULT_TARGET_MARGIN_BPS,
} from "../src/index";

describe("pricing defaults and model quotes", () => {
  it("exposes expected default constants", () => {
    expect(DEFAULT_FX_RATE.baisaNumerator).toBe(769n);
    expect(DEFAULT_FX_RATE.baisaDenominator).toBe(2n);
    expect(DEFAULT_CREDITS_PER_BAISA).toBe(1n);
    expect(DEFAULT_TARGET_MARGIN_BPS).toBe(2500);
  });

  it("calculates accurate quotes for seedream-5-lite (image)", () => {
    const quote = calculateModelQuote({
      providerCostMicroUsd: 54_000n,
    });
    expect(quote.customerCredits).toBe(28n);
    expect(quote.convertedCostBaisa).toBe(21n);
    expect(quote.customerPriceBaisa).toBe(28n);
  });

  it("calculates accurate quotes for seedream-4-5 (image)", () => {
    const quote = calculateModelQuote({
      providerCostMicroUsd: 41_000n,
    });
    expect(quote.customerCredits).toBe(22n);
    expect(quote.convertedCostBaisa).toBe(16n);
    expect(quote.customerPriceBaisa).toBe(22n);
  });

  it("calculates accurate quotes for seedance-2-5 (video)", () => {
    const quote = calculateModelQuote({
      providerCostMicroUsd: 468_000n,
    });
    expect(quote.customerCredits).toBe(240n);
    expect(quote.convertedCostBaisa).toBe(180n);
    expect(quote.customerPriceBaisa).toBe(240n);
  });

  it("calculates accurate quotes for seed-speech-2 (voice)", () => {
    const quote = calculateModelQuote({
      providerCostMicroUsd: 10_000n,
    });
    expect(quote.customerCredits).toBe(6n);
    expect(quote.convertedCostBaisa).toBe(4n);
    expect(quote.customerPriceBaisa).toBe(6n);
  });

  it("scales quote correctly with units", () => {
    const single = calculateModelQuote({
      providerCostMicroUsd: 10_000n,
      units: 1,
    });
    const multi = calculateModelQuote({
      providerCostMicroUsd: 10_000n,
      units: 3,
    });
    expect(single.customerCredits).toBe(6n);
    expect(multi.customerCredits).toBe(16n); // ceil(30000 * 769 / 2000000) = 12 baisa, ceil(12 * 10000 / 7500) = 16 baisa
  });

  it("rejects invalid units", () => {
    expect(() =>
      calculateModelQuote({
        providerCostMicroUsd: 10_000n,
        units: 0,
      }),
    ).toThrow("units must be greater than zero");

    expect(() =>
      calculateModelQuote({
        providerCostMicroUsd: 10_000n,
        units: -2,
      }),
    ).toThrow("units must be greater than zero");
  });
});
