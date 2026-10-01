import { describe, expect, it } from "vitest";

import {
  estimateGeneration,
  getImageGenerationProviderCostMicroUsd,
} from "../src/usage";

const price = {
  providerCostMicroUsd: 40_500n,
  fxBaisaNumerator: 769n,
  fxBaisaDenominator: 2n,
  targetMarginBps: 2500,
  creditsPerBaisa: 1n,
  pricingDimension: "REQUEST",
  unitQuantity: 1,
};

describe("Seedream 5.0 Pro image pricing", () => {
  it("uses the discounted low tier for 1K and 1.5K and doubles the 2K output cost", () => {
    for (const resolution of ["1K", "1.5K"] as const) {
      expect(
        getImageGenerationProviderCostMicroUsd({
          providerModelId: "dola-seedream-5-0-pro-260628",
          baseCostMicroUsd: 40_500n,
          resolution,
          outputCount: 1,
        }),
      ).toBe(40_500n);
    }

    expect(
      getImageGenerationProviderCostMicroUsd({
        providerModelId: "dola-seedream-5-0-pro-260628",
        baseCostMicroUsd: 40_500n,
        resolution: "2K",
        outputCount: 1,
      }),
    ).toBe(81_000n);
  });

  it("charges every additional reference after the first at the contract ratio", () => {
    expect(
      getImageGenerationProviderCostMicroUsd({
        providerModelId: "dola-seedream-5-0-pro-260628",
        baseCostMicroUsd: 40_500n,
        resolution: "1.5K",
        outputCount: 1,
        referenceImageCount: 10,
      }),
    ).toBe(64_800n);
  });

  it("quotes 22 credits at 1.5K and 43 credits at 2K before generation", () => {
    const low = estimateGeneration({
      price,
      mediaKind: "IMAGE",
      providerModelId: "dola-seedream-5-0-pro-260628",
      resolution: "1.5K",
      units: 1,
      referenceImageCount: 1,
    });
    const high = estimateGeneration({
      price,
      mediaKind: "IMAGE",
      providerModelId: "dola-seedream-5-0-pro-260628",
      resolution: "2K",
      units: 1,
      referenceImageCount: 1,
    });

    expect(low.quote.providerCostMicroUsd).toBe(40_500n);
    expect(low.quote.customerCredits).toBe(22n);
    expect(high.quote.providerCostMicroUsd).toBe(81_000n);
    expect(high.quote.customerCredits).toBe(43n);
  });

  it("rejects sequential output billing for Pro", () => {
    expect(() =>
      getImageGenerationProviderCostMicroUsd({
        providerModelId: "dola-seedream-5-0-pro-260628",
        baseCostMicroUsd: 40_500n,
        resolution: "1.5K",
        outputCount: 2,
      }),
    ).toThrow("supports one generated image");
  });
});
