import { describe, expect, it } from "vitest";

import { createCreditQuote } from "../src/index";

describe("credit quote", () => {
  it("uses integer arithmetic and rounds cost exposure upward", () => {
    const quote = createCreditQuote({
      providerCostMicroUsd: 1_000_000n,
      exchangeRate: {
        baisaNumerator: 769n,
        baisaDenominator: 2n,
      },
      targetGrossMarginBps: 2_500,
      creditsPerBaisa: 10n,
    });

    expect(quote.convertedCostBaisa).toBe(385n);
    expect(quote.customerPriceBaisa).toBe(514n);
    expect(quote.customerCredits).toBe(5_140n);
  });

  it("rejects a margin that cannot produce a finite price", () => {
    expect(() =>
      createCreditQuote({
        providerCostMicroUsd: 1n,
        exchangeRate: { baisaNumerator: 1n, baisaDenominator: 1n },
        targetGrossMarginBps: 10_000,
        creditsPerBaisa: 1n,
      }),
    ).toThrow("targetGrossMarginBps");
  });
});
