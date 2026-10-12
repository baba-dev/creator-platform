import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  modelFindMany: vi.fn(),
  modelFindUnique: vi.fn(),
  toolFindMany: vi.fn(),
}));
vi.mock("@aiwa/db", () => ({
  db: {
    providerModel: {
      findMany: mocks.modelFindMany,
      findUnique: mocks.modelFindUnique,
    },
    providerTool: { findMany: mocks.toolFindMany },
  },
}));
vi.mock("@aiwa/providers/byteplus", () => ({
  isBytePlusMediaKitConfigured: () => false,
}));

import {
  estimatePublicPricing,
  formatCustomerOmr,
  getPublicPricingCatalogue,
  publicModelItem,
} from "./public-pricing";

const snapshot = {
  id: "price-version",
  effectiveFrom: new Date("2026-10-01T00:00:00Z"),
  providerCostMicroUsd: 1000n,
  customerCredits: 1n,
  fxBaisaNumerator: 769n,
  fxBaisaDenominator: 2n,
  targetMarginBps: 2500,
  creditsPerBaisa: 1n,
  pricingDimension: "TOKEN",
  unitQuantity: 1,
  usageRates: {
    estimator: "text-token-v1",
    tiers: [
      {
        maxPromptTokens: 8192,
        inputMicroUsdPerMillionTokens: "100000",
        cachedInputMicroUsdPerMillionTokens: "20000",
        outputMicroUsdPerMillionTokens: "200000",
      },
    ],
  },
};
const model = {
  id: "public-id",
  provider: "GROQ",
  providerModelId: "sample-chat-model",
  displayName: "Sample chat model",
  description: "Writing and reasoning.",
  mediaKind: "TEXT",
  capabilities: { "task:chat": true, contextWindow: 8192 },
  priceVersions: [snapshot],
};
beforeEach(() => {
  vi.clearAllMocks();
  process.env.GROQ_API_KEY = "test-only-key";
  mocks.modelFindMany.mockResolvedValue([model]);
  mocks.toolFindMany.mockResolvedValue([]);
  mocks.modelFindUnique.mockResolvedValue({ priceVersions: [snapshot] });
});

describe("public customer pricing safety", () => {
  it("formats the established credit denomination without floating-point drift", () => {
    expect(formatCustomerOmr(1000n, 1n)).toBe("1.000 OMR");
    expect(formatCustomerOmr(1n, 1n)).toBe("0.001 OMR");
    expect(formatCustomerOmr(2000n, 2n)).toBe("1.000 OMR");
    expect(() => formatCustomerOmr(1n, 2n)).toThrow();
  });

  it("projects enabled model metadata and retail tiers without leaking financial internals", () => {
    const item = publicModelItem(model);
    expect(item).toMatchObject({
      id: "public-id",
      provider: "GROQ",
      category: "chat",
      calculator: "text",
      availableIn: ["Chat"],
      priceVersionId: "price-version",
    });
    expect(item?.tiers).toHaveLength(1);
    expect(item?.tiers[0]?.cachedInputCreditsPerMillion).not.toBeNull();
    const json = JSON.stringify(item);
    for (const field of [
      "providerCostMicroUsd",
      "targetMarginBps",
      "fxBaisaNumerator",
      "usageRates",
      "test-only-key",
    ]) {
      expect(json).not.toContain(field);
    }
  });

  it("keeps dedicated audio in its own section without promising a fixed quote", () => {
    const audio = publicModelItem({
      ...model,
      providerModelId: "seed-audio-1.0",
      mediaKind: "VOICE",
      capabilities: { audioGeneration: true },
      priceVersions: [{ ...snapshot, pricingDimension: "SECOND", usageRates: null }],
    });
    expect(audio).toMatchObject({
      category: "audio",
      availableIn: ["Audio Generation"],
      calculator: "reference",
    });
  });

  it("does not manufacture text prices when a legacy snapshot lacks rate tiers", () => {
    expect(
      publicModelItem({
        ...model,
        priceVersions: [{ ...snapshot, usageRates: null }],
      }),
    ).toBeNull();
  });

  it("does not advertise disabled or unpriced models", async () => {
    const catalogue = await getPublicPricingCatalogue(
      new Date("2026-10-12T00:00:00Z"),
    );
    expect(catalogue.models).toHaveLength(1);
    expect(mocks.modelFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          enabled: true,
          priceVersions: { some: expect.any(Object) },
        }),
      }),
    );
    expect(JSON.stringify(catalogue)).not.toContain("providerCostMicroUsd");
  });

  it("uses registered token billing for a public example without reserving or creating work", async () => {
    const result = await estimatePublicPricing({
      id: "public-id",
      version: "price-version",
      promptTokens: 2000,
      cachedPromptTokens: 500,
      completionTokens: 500,
    });
    expect(BigInt(result.estimatedCredits)).toBeGreaterThan(0n);
    expect(result.isEstimate).toBe(true);
    expect(result.note).toContain("authenticated Studio quote");
    expect(mocks.modelFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "public-id" },
        select: expect.objectContaining({ priceVersions: expect.any(Object) }),
      }),
    );
  });

  it("rejects retired client versions and unsupported quantities", async () => {
    await expect(
      estimatePublicPricing({
        id: "public-id",
        version: "retired",
        promptTokens: 1,
        completionTokens: 1,
      }),
    ).rejects.toThrow();
    await expect(
      estimatePublicPricing({
        id: "public-id",
        version: "price-version",
        promptTokens: 9000,
        completionTokens: 1,
      }),
    ).rejects.toThrow();
  });
});
