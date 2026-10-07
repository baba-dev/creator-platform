import { describe, expect, it } from "vitest";
import {
  estimateGeneration,
  estimateVideoTokens,
  normalizeLegacyTextUsageRatesForProvider,
  parseTextUsageRates,
  parseTextUsageRatesForProvider,
  parseUsageRates,
  quoteImageOutputs,
  selectUsageRate,
  textProviderCostMicroUsd,
  textUsageEstimatorForProvider,
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
  it("reserves Seed Audio against the declared multi-segment envelope", () => {
    const seedAudioPrice: PriceSnapshot = {
      ...price,
      pricingDimension: "SECOND",
      providerCostMicroUsd: 18_000n,
      unitQuantity: 1,
      usageRates: undefined,
    };
    const native = estimateGeneration({
      price: seedAudioPrice,
      mediaKind: "VOICE",
      providerModelId: "seed-audio-1.0",
      durationSeconds: 90,
      billableQuantity: 90,
    });
    const longForm = estimateGeneration({
      price: seedAudioPrice,
      mediaKind: "VOICE",
      providerModelId: "seed-audio-1.0",
      durationSeconds: 240,
      billableQuantity: 240,
      reservationBillableQuantity: 360,
    });
    expect(native.reservation.providerCostMicroUsd).toBe(18_000n * 120n);
    expect(longForm.quote.providerCostMicroUsd).toBe(18_000n * 240n);
    expect(longForm.reservation.providerCostMicroUsd).toBe(18_000n * 360n);
    expect(longForm.reservation.customerCredits).toBeGreaterThan(
      longForm.quote.customerCredits,
    );
  });

  it("supports v2 rate tables and prices aggregate reference-video duration", () => {
    const v2Rates = { ...usageRates, estimator: "byteplus-video-v2" as const };
    expect(parseUsageRates(v2Rates).estimator).toBe("byteplus-video-v2");
    expect(
      estimateVideoTokens({
        resolution: "720p",
        aspectRatio: "16:9",
        durationSeconds: 5,
        totalInputVideoDurationMs: 7_000,
      }),
    ).toBe(
      estimateVideoTokens({
        resolution: "720p",
        aspectRatio: "16:9",
        durationSeconds: 5,
        inputDurationMs: 7_000,
      }),
    );
    const result = estimateGeneration({
      price: { ...price, usageRates: v2Rates },
      mediaKind: "VIDEO",
      providerModelId: "dreamina-seedance-2-5-260628",
      resolution: "720p",
      aspectRatio: "16:9",
      durationSeconds: 5,
      totalInputVideoDurationMs: 7_000,
    });
    expect(result.settlement).toBe("ACTUAL_USAGE");
    expect(result.estimatedTokens).not.toBeNull();
    expect(result.quote.providerCostMicroUsd).toBeGreaterThan(0n);
    expect(result.reservation.customerCredits).toBeGreaterThan(
      result.quote.customerCredits,
    );
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

  it("maps text pricing estimators to the provider family", () => {
    expect(textUsageEstimatorForProvider("BYTEPLUS")).toBe("byteplus-text-v1");
    for (const provider of ["NVIDIA", "GROQ", "GEMINI", "CLOUDFLARE"]) {
      expect(textUsageEstimatorForProvider(provider)).toBe("text-token-v1");
    }
    expect(() => textUsageEstimatorForProvider("UNKNOWN")).toThrow(
      "not registered",
    );
  });

  it("rejects cross-provider text estimator snapshots at publication boundaries", () => {
    const generic = {
      estimator: "text-token-v1",
      tiers: [
        {
          maxPromptTokens: 131072,
          inputMicroUsdPerMillionTokens: "1000000",
          outputMicroUsdPerMillionTokens: "2000000",
        },
      ],
    };
    expect(parseTextUsageRatesForProvider(generic, "GROQ").estimator).toBe(
      "text-token-v1",
    );
    expect(() => parseTextUsageRatesForProvider(generic, "BYTEPLUS")).toThrow(
      "byteplus-text-v1",
    );

    const byteplus = { ...generic, estimator: "byteplus-text-v1" };
    expect(parseTextUsageRatesForProvider(byteplus, "BYTEPLUS").estimator).toBe(
      "byteplus-text-v1",
    );
    expect(() => parseTextUsageRatesForProvider(byteplus, "GEMINI")).toThrow(
      "text-token-v1",
    );
  });

  it("normalizes only the registered cross-provider legacy estimator label", () => {
    const tiers = [
      {
        maxPromptTokens: 131072,
        inputMicroUsdPerMillionTokens: "1000000",
        outputMicroUsdPerMillionTokens: "2000000",
      },
    ];
    expect(
      normalizeLegacyTextUsageRatesForProvider(
        { estimator: "byteplus-text-v1", tiers },
        "GROQ",
      ).estimator,
    ).toBe("text-token-v1");
    expect(
      normalizeLegacyTextUsageRatesForProvider(
        { estimator: "text-token-v1", tiers },
        "BYTEPLUS",
      ).estimator,
    ).toBe("byteplus-text-v1");
    expect(() =>
      normalizeLegacyTextUsageRatesForProvider(
        { estimator: "legacy-text-v0", tiers },
        "GROQ",
      ),
    ).toThrow(/unsupported text usage estimator/i);
    expect(() =>
      normalizeLegacyTextUsageRatesForProvider(
        { estimator: "byteplus-text-v1", tiers: [] },
        "GROQ",
      ),
    ).toThrow(/rate table/i);
  });

  it.each([
    ["GROQ", "openai/gpt-oss-20b"],
    ["GEMINI", "gemini-3.5-flash-lite"],
    ["CLOUDFLARE", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"],
  ])(
    "quotes %s text usage with the generic external estimator",
    (_provider, providerModelId) => {
      const externalRates = {
        estimator: "text-token-v1",
        tiers: [
          {
            maxPromptTokens: 1_048_576,
            inputMicroUsdPerMillionTokens: "1000000",
            outputMicroUsdPerMillionTokens: "2000000",
          },
        ],
      };
      const result = estimateGeneration({
        price: {
          ...price,
          providerCostMicroUsd: 2000n,
          usageRates: externalRates,
        },
        mediaKind: "TEXT",
        providerModelId,
        text: "abcd",
        units: 1000,
      });
      expect(result.settlement).toBe("ACTUAL_USAGE");
      expect(result.quote.providerCostMicroUsd).toBe(2002n);
      expect(result.reservation.providerCostMicroUsd).toBe(2004n);
    },
  );

  it("uses generic external text token rates for both quote and reservation", () => {
    const textRates = {
      estimator: "text-token-v1",
      tiers: [
        {
          maxPromptTokens: 1_000_000,
          inputMicroUsdPerMillionTokens: "1000000",
          outputMicroUsdPerMillionTokens: "2000000",
        },
      ],
    };
    const result = estimateGeneration({
      price: {
        ...price,
        providerCostMicroUsd: 999999n,
        usageRates: textRates,
      },
      mediaKind: "TEXT",
      providerModelId: "external-text-model",
      text: "abcd",
      units: 1000,
    });
    expect(result.settlement).toBe("ACTUAL_USAGE");
    expect(result.quote.providerCostMicroUsd).toBe(2002n);
    expect(result.reservation.providerCostMicroUsd).toBe(2004n);
  });

  it("prices text input, cached input and output independently", () => {
    const textRates = {
      estimator: "byteplus-text-v1",
      tiers: [
        {
          maxPromptTokens: 131072,
          inputMicroUsdPerMillionTokens: "500000",
          cachedInputMicroUsdPerMillionTokens: "100000",
          outputMicroUsdPerMillionTokens: "3000000",
        },
        {
          maxPromptTokens: 262144,
          inputMicroUsdPerMillionTokens: "1000000",
          cachedInputMicroUsdPerMillionTokens: "200000",
          outputMicroUsdPerMillionTokens: "6000000",
        },
      ],
    };
    expect(parseTextUsageRates(textRates).tiers).toHaveLength(2);
    expect(
      textProviderCostMicroUsd(textRates, {
        promptTokens: 1000,
        cachedPromptTokens: 200,
        completionTokens: 500,
      }),
    ).toBe(1920n);
    expect(
      textProviderCostMicroUsd(textRates, {
        promptTokens: 150000,
        completionTokens: 1000,
      }),
    ).toBe(156000n);
  });

  it("estimates and reserves credits for Seed text generation using TOKEN pricing", () => {
    const textPrice: PriceSnapshot = {
      providerCostMicroUsd: 2000n, // $2.00 per 1000 tokens
      pricingDimension: "TOKEN",
      unitQuantity: 1000,
      fxBaisaNumerator: 769n,
      fxBaisaDenominator: 2n,
      targetMarginBps: 2500,
      creditsPerBaisa: 1n,
    };

    const estimate = estimateGeneration({
      price: textPrice,
      mediaKind: "TEXT",
      providerModelId: "dola-seed-2-1-turbo-260628",
      text: "Write a high-energy script for a commercial.",
      units: 1000, // 1000 requested completion tokens
    });

    expect(estimate.settlement).toBe("ACTUAL_USAGE");
    expect(estimate.estimatedTokens).toBeGreaterThan(1000n);
    expect(estimate.quote.customerCredits).toBeGreaterThan(0n);
    expect(estimate.reservation.customerCredits).toBeGreaterThanOrEqual(
      estimate.quote.customerCredits,
    );
  });
  it("prices OmniHuman by trusted seconds without a 1080p surcharge", () => {
    const omniHumanPrice: PriceSnapshot = {
      providerCostMicroUsd: 120_000n,
      pricingDimension: "SECOND",
      unitQuantity: 1,
      fxBaisaNumerator: 769n,
      fxBaisaDenominator: 2n,
      targetMarginBps: 2500,
      creditsPerBaisa: 1n,
    };

    const p720 = estimateGeneration({
      price: omniHumanPrice,
      mediaKind: "VIDEO",
      providerModelId: "omnihuman-1.5",
      durationSeconds: 15,
      resolution: "720p",
    });
    const p1080 = estimateGeneration({
      price: omniHumanPrice,
      mediaKind: "VIDEO",
      providerModelId: "omnihuman-1.5",
      durationSeconds: 15,
      resolution: "1080p",
    });

    expect(p720.settlement).toBe("FIXED");
    expect(p720.units).toBe(15);
    expect(p720.quote.customerCredits).toBe(924n);
    expect(p1080.quote.customerCredits).toBe(924n);
  });
});
