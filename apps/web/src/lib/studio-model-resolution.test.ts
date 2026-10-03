import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  providerModel: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock("@aiwa/db", () => ({
  db: {
    providerModel: mocks.providerModel,
  },
}));

import {
  resolveStudioModelSelection,
  StudioModelUnavailableError,
} from "./studio-model-discovery";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("canonical Studio model resolution", () => {
  it("fails closed when a known canonical model becomes unavailable", async () => {
    mocks.providerModel.findUnique
      .mockResolvedValueOnce({ id: "canonical-record" })
      .mockResolvedValueOnce({
        id: "canonical-record",
        provider: "GROQ",
        providerModelId: "openai/gpt-oss-20b",
        displayName: "GPT-OSS 20B",
        description: "Character model",
        mediaKind: "TEXT",
        enabled: true,
        capabilities: { characterChat: true },
        priceVersions: [],
      });

    await expect(
      resolveStudioModelSelection("canonical-record", "character-chat", {
        environment: { GROQ_API_KEY: "groq" },
      }),
    ).rejects.toBeInstanceOf(StudioModelUnavailableError);
    expect(mocks.providerModel.findMany).not.toHaveBeenCalled();
  });

  it("upgrades a unique legacy upstream id to the canonical record", async () => {
    mocks.providerModel.findUnique.mockResolvedValueOnce(null);
    mocks.providerModel.findMany.mockResolvedValueOnce([
      {
        id: "canonical-groq",
        provider: "GROQ",
        providerModelId: "openai/gpt-oss-20b",
        displayName: "GPT-OSS 20B",
        description: "Character model",
        mediaKind: "TEXT",
        enabled: true,
        capabilities: { characterChat: true, contextWindow: 131072 },
        priceVersions: [
          {
            id: "price-1",
            pricingDimension: "TOKEN",
            unitQuantity: 1000,
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
          },
        ],
      },
    ]);

    await expect(
      resolveStudioModelSelection("openai/gpt-oss-20b", "character-chat", {
        environment: { GROQ_API_KEY: "groq" },
      }),
    ).resolves.toMatchObject({
      id: "canonical-groq",
      provider: "GROQ",
      providerModelId: "openai/gpt-oss-20b",
    });
  });
});
