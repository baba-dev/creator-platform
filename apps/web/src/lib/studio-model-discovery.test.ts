import { describe, expect, it } from "vitest";

import {
  selectDiscoverableStudioModels,
  type StudioModelRow,
} from "./studio-model-discovery";

const price = {
  id: "price-1",
  pricingDimension: "TOKEN" as const,
  unitQuantity: 1000,
};

function row(
  overrides: Partial<StudioModelRow> & Pick<StudioModelRow, "id" | "providerModelId">,
): StudioModelRow {
  return {
    id: overrides.id,
    provider: "BYTEPLUS",
    providerModelId: overrides.providerModelId,
    displayName: overrides.providerModelId,
    description: "Test model",
    mediaKind: "TEXT",
    enabled: true,
    capabilities: { chat: true },
    priceVersions: [price],
    ...overrides,
  };
}

describe("Studio model discovery", () => {
  it("requires enabled, priced, task-compatible and configured models", () => {
    const result = selectDiscoverableStudioModels(
      [
        row({
          id: "good",
          provider: "GROQ",
          providerModelId: "openai/gpt-oss-20b",
          capabilities: { chat: true, characterChat: true },
        }),
        row({
          id: "disabled",
          provider: "GROQ",
          providerModelId: "disabled",
          enabled: false,
          capabilities: { characterChat: true },
        }),
        row({
          id: "unpriced",
          provider: "GROQ",
          providerModelId: "unpriced",
          priceVersions: [],
          capabilities: { characterChat: true },
        }),
        row({
          id: "wrong-task",
          provider: "GROQ",
          providerModelId: "wrong-task",
          capabilities: { scriptwriting: true },
        }),
      ],
      "character-chat",
      { GROQ_API_KEY: "groq" },
    );

    expect(result.models.map((model) => model.id)).toEqual(["good"]);
  });

  it("hides otherwise valid models when provider credentials are absent", () => {
    const result = selectDiscoverableStudioModels(
      [
        row({
          id: "groq",
          provider: "GROQ",
          providerModelId: "openai/gpt-oss-20b",
          capabilities: { characterChat: true },
        }),
      ],
      "character-chat",
      {},
    );
    expect(result.models).toEqual([]);
    expect(result.defaultModelId).toBeNull();
  });

  it("preserves the current Character Chat default deterministically", () => {
    const result = selectDiscoverableStudioModels(
      [
        row({
          id: "groq",
          provider: "GROQ",
          providerModelId: "openai/gpt-oss-20b",
          displayName: "AAA Groq",
          capabilities: { characterChat: true },
        }),
        row({
          id: "seed-character-record",
          providerModelId: "doubao-seed-character-260628",
          displayName: "Seed Character",
          capabilities: { characterChat: true },
        }),
      ],
      "character-chat",
      {
        GROQ_API_KEY: "groq",
        BYTEPLUS_API_KEY: "byteplus",
      },
    );

    expect(result.defaultModelId).toBe("seed-character-record");
    expect(result.models[0]?.id).toBe("seed-character-record");
  });

  it("returns only safe public pricing metadata", () => {
    const result = selectDiscoverableStudioModels(
      [
        row({
          id: "model-record",
          providerModelId: "doubao-seed-character-260628",
          capabilities: {
            characterChat: true,
            contextWindow: 131072,
            maxTokens: 4096,
          },
        }),
      ],
      "character-chat",
      { BYTEPLUS_API_KEY: "byteplus" },
    );

    expect(result.models[0]).toMatchObject({
      id: "model-record",
      contextWindow: 131072,
      maxTokens: 4096,
      pricing: {
        priceVersionId: "price-1",
        dimension: "TOKEN",
        unitQuantity: 1000,
      },
    });
    expect(result.models[0]).not.toHaveProperty("providerCostMicroUsd");
    expect(result.models[0]).not.toHaveProperty("customerCredits");
  });
});
