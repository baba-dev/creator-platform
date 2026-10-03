import { describe, expect, it } from "vitest";

import {
  estimateReasoningProviderCost,
  settleReasoningProviderCost,
} from "../src/reasoning";

const tokenPrice = {
  providerCostMicroUsd: 999999n,
  pricingDimension: "TOKEN",
  usageRates: {
    estimator: "text-token-v1",
    tiers: [
      {
        maxPromptTokens: 131072,
        inputMicroUsdPerMillionTokens: "1000000",
        outputMicroUsdPerMillionTokens: "2000000",
      },
    ],
  },
};

describe("reasoning provider cost observability", () => {
  it("uses configured request cost without inventing token usage", () => {
    expect(
      estimateReasoningProviderCost({
        price: {
          providerCostMicroUsd: 2500n,
          pricingDimension: "REQUEST",
        },
        promptCharacters: 500,
      }),
    ).toEqual({
      providerCostMicroUsd: 2500n,
      basis: "CONFIGURED_RATE",
      estimatedInputTokens: null,
      maximumOutputTokens: null,
    });

    expect(
      settleReasoningProviderCost({
        price: {
          providerCostMicroUsd: 2500n,
          pricingDimension: "REQUEST",
        },
      }),
    ).toEqual({
      providerCostMicroUsd: 2500n,
      basis: "CONFIGURED_RATE",
    });
  });

  it("estimates token-priced reasoning conservatively", () => {
    const estimate = estimateReasoningProviderCost({
      price: tokenPrice,
      promptCharacters: 200,
      maximumOutputTokens: 2048,
    });

    expect(estimate.estimatedInputTokens).toBe(100);
    expect(estimate.maximumOutputTokens).toBe(2048);
    expect(estimate.providerCostMicroUsd).toBe(4196n);
    expect(estimate.basis).toBe("ESTIMATED_TOKENS");
  });

  it("settles token pricing from provider-reported input/output tokens", () => {
    expect(
      settleReasoningProviderCost({
        price: tokenPrice,
        inputTokens: 100,
        outputTokens: 50,
      }),
    ).toEqual({
      providerCostMicroUsd: 200n,
      basis: "PROVIDER_USAGE",
    });
  });

  it("keeps successful reasoning observable when provider usage is absent", () => {
    expect(
      settleReasoningProviderCost({
        price: tokenPrice,
        inputTokens: undefined,
        outputTokens: undefined,
      }),
    ).toEqual({
      providerCostMicroUsd: null,
      basis: "USAGE_UNAVAILABLE",
    });
  });
});
