import { describe, expect, it } from "vitest";
import {
  estimateGeneration,
  estimateVideoTokens,
  parseUsageRates,
  quoteImageOutputs,
  selectUsageRate,
  type PriceSnapshot,
} from "../src/index";
import { parseMarginPercent, createCreditQuote } from "../src/pricing";
const usageRates = {
  estimator: "byteplus-video-v1",
  rates: [
    {
      resolution: "720p",
      workflow: "GENERATE",
      microUsdPerThousandTokens: "10700",
    },
    {
      resolution: "1080p",
      workflow: "GENERATE",
      microUsdPerThousandTokens: "11700",
    },
    {
      resolution: "720p",
      workflow: "VIDEO_INPUT",
      microUsdPerThousandTokens: "6400",
    },
    {
      resolution: "1080p",
      workflow: "VIDEO_INPUT",
      microUsdPerThousandTokens: "7000",
    },
  ],
};
const price: PriceSnapshot = {
  providerCostMicroUsd: 10700n,
  pricingDimension: "TOKEN",
  unitQuantity: 1000,
  fxBaisaNumerator: 769n,
  fxBaisaDenominator: 2n,
  targetMarginBps: 2500,
  creditsPerBaisa: 1n,
  usageRates,
};
describe("generation pricing policies", () => {
  it.each([1, 2, 4, 15])(
    "preserves per-image reservation and partial-capture rounding for %i outputs",
    (count) => {
      const result = quoteImageOutputs(
        { ...price, pricingDimension: "REQUEST", providerCostMicroUsd: 31500n },
        count,
      );
      expect(result.customerCredits).toBe(18n * BigInt(count));
      expect(result.providerCostMicroUsd).toBe(31500n * BigInt(count));
    },
  );
  it("prices video using resolution and workflow, without an invented audio surcharge", () => {
    const input = {
      price,
      mediaKind: "VIDEO",
      providerModelId: "dreamina-seedance-2-5-260628",
      resolution: "720p",
      aspectRatio: "16:9",
      durationSeconds: 5,
    };
    const result = estimateGeneration(input);
    expect(result.estimatedTokens).toBe(108000n);
    expect(result.quote.providerCostMicroUsd).toBe(1155600n);
    expect(result.quote.customerCredits).toBe(594n);
    expect(result.reservation.customerCredits).toBeGreaterThan(
      result.quote.customerCredits,
    );
    expect(estimateGeneration({ ...input, generateAudio: true })).toEqual(
      result,
    );
    const high = estimateGeneration({ ...input, resolution: "1080p" });
    expect(high.quote.providerCostMicroUsd).toBe(2843100n);
    expect(high.quote.customerCredits).toBe(1459n);
    const ref = estimateGeneration({ ...input, inputDurationMs: 5000 });
    expect(ref.quote.providerCostMicroUsd).toBe(1382400n);
    expect(ref.reservation.customerCredits).toBe(4362n);
  });
  it("uses the adaptive envelope and rejects unconfigured workflows", () => {
    const input = {
      price,
      mediaKind: "VIDEO",
      providerModelId: "future-video-model",
      durationSeconds: 5,
      resolution: "720p",
    };
    expect(
      estimateGeneration({ ...input, aspectRatio: "adaptive" }).estimatedTokens,
    ).toBe(151875n);
    expect(() => estimateGeneration({ ...input, resolution: "4K" })).toThrow(
      "No token rate",
    );
    expect(() =>
      estimateGeneration({ ...input, price: { ...price, usageRates: null } }),
    ).toThrow("requires a rate table");
    expect(() =>
      estimateVideoTokens({
        durationSeconds: 0,
        resolution: "720p",
        aspectRatio: "16:9",
      }),
    ).toThrow();
  });
  it("fails closed for obsolete ordinary Seedance pricing but preserves snapshots for other models", () => {
    const input = {
      price: {
        ...price,
        pricingDimension: "SECOND",
        providerCostMicroUsd: 468000n,
        unitQuantity: 5,
      },
      mediaKind: "VIDEO",
      providerModelId: "dreamina-seedance-2-5-260628",
      durationSeconds: 5,
    };
    expect(() => estimateGeneration(input)).toThrow("Publish token pricing");
    expect(
      estimateGeneration({ ...input, providerModelId: "other-fixed-video" })
        .quote.customerCredits,
    ).toBe(240n);
  });
  it("counts spaces and newlines at block boundaries and canonicalizes submitted text", () => {
    const voice = {
      price: {
        ...price,
        pricingDimension: "CHARACTER",
        providerCostMicroUsd: 30000n,
      },
      mediaKind: "VOICE",
      providerModelId: "seed-tts-2.0",
    };
    expect(
      estimateGeneration({ ...voice, text: "a".repeat(999) + "\n" + "b" }).quote
        .customerCredits,
    ).toBe(32n);
    expect(
      estimateGeneration({ ...voice, text: "a".repeat(1000) }).quote
        .customerCredits,
    ).toBe(16n);
    expect(
      estimateGeneration({ ...voice, text: "a ".repeat(1000).trim() }).quote
        .customerCredits,
    ).toBe(32n);
    expect(
      estimateGeneration({ ...voice, text: "  Hello world  " })
        .billableQuantity,
    ).toBe(11);
  });
  it("validates rate selectors and monetary inputs without floating point", () => {
    expect(selectUsageRate(usageRates, "720p", true)).toBe(6400n);
    expect(() =>
      parseUsageRates({
        ...usageRates,
        rates: [usageRates.rates[0], usageRates.rates[0]],
      }),
    ).toThrow("Duplicate");
    expect(() =>
      parseUsageRates({
        ...usageRates,
        rates: [{ ...usageRates.rates[0], microUsdPerThousandTokens: "0" }],
      }),
    ).toThrow("Invalid");
    expect(parseMarginPercent("25.01")).toBe(2501);
    expect(parseMarginPercent("0")).toBe(0);
    expect(() => parseMarginPercent("25.001")).toThrow();
    expect(() =>
      createCreditQuote({
        providerCostMicroUsd: 1n,
        creditsPerBaisa: 1n,
        targetGrossMarginBps: 2500,
        exchangeRate: { baisaNumerator: -1n, baisaDenominator: 2n },
      }),
    ).toThrow("must be positive");
  });
});
