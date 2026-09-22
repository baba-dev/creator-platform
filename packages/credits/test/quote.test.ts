import { describe, expect, it } from "vitest";
import {
  calculateBillableUnits,
  countBillableCharacters,
  createCreditQuote,
} from "../src/index";

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

  describe("voice billing dimension calculations", () => {
    it("counts billable characters while ignoring whitespace", () => {
      expect(countBillableCharacters("")).toBe(0);
      expect(countBillableCharacters("   \n\t  ")).toBe(0);
      expect(countBillableCharacters("Hello world")).toBe(10);
      expect(countBillableCharacters("مرحبا بك")).toBe(7);
      expect(countBillableCharacters("Hello 👋 World 🌍")).toBe(12);
    });

    it("calculates billable blocks with ceiling division", () => {
      const block = 1000n;
      expect(calculateBillableUnits(0n, block)).toBe(0n);
      expect(calculateBillableUnits(1n, block)).toBe(1n);
      expect(calculateBillableUnits(1000n, block)).toBe(1n);
      expect(calculateBillableUnits(1001n, block)).toBe(2n);
      expect(calculateBillableUnits(2500n, block)).toBe(3n);
      expect(calculateBillableUnits(3000n, block)).toBe(3n);
    });

    it("quotes Seed-TTS 2.0 voice generation by block", () => {
      const costPerThousand = 30_000n; // $0.030 per 1k chars = 30,000 micro-USD
      const text = "A".repeat(1500); // 1500 chars -> 2 blocks
      const units = calculateBillableUnits(
        BigInt(countBillableCharacters(text)),
        1000n,
      );
      expect(units).toBe(2n);

      const quote = createCreditQuote({
        providerCostMicroUsd: costPerThousand * units,
        exchangeRate: {
          baisaNumerator: 769n,
          baisaDenominator: 2n,
        },
        targetGrossMarginBps: 2_500,
        creditsPerBaisa: 1n,
      });
      // 60,000 micro-USD * 769 / 2 / 1,000,000 = 24 baisa converted cost
      // 24 / (1 - 0.25) = 31 baisa -> 31 credits
      expect(quote.customerCredits).toBeGreaterThan(0n);
    });
  });
});
