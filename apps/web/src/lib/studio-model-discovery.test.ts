import { describe, expect, it } from "vitest";

import {
  selectDiscoverableStudioModels,
  selectStudioModelBySelection,
  StudioModelUnavailableError,
  type StudioModelRow,
} from "./studio-model-discovery";

const price = {
  id: "price-1",
  pricingDimension: "TOKEN" as const,
  unitQuantity: 1000,
};

function row(
  overrides: Partial<StudioModelRow> &
    Pick<StudioModelRow, "id" | "providerModelId">,
): StudioModelRow {
  return {
    provider: "BYTEPLUS",
    displayName: overrides.providerModelId,
    description: "Test model",
    mediaKind: "TEXT",
    enabled: true,
    capabilities: { chat: true },
    priceVersions: [price],
    ...overrides,
    id: overrides.id,
    providerModelId: overrides.providerModelId,
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

describe("Studio model selection compatibility", () => {
  const discovery = {
    task: "character-chat" as const,
    defaultModelId: "byteplus-record",
    models: [
      {
        id: "byteplus-record",
        provider: "BYTEPLUS",
        providerModelId: "doubao-seed-character-260628",
        name: "Seed Character",
        description: "Character model",
        mediaKind: "TEXT",
        contextWindow: 32768,
        maxTokens: null,
        flags: { reasoning: false, fast: false },
        tasks: ["character-chat" as const],
        pricing: {
          priceVersionId: "price-1",
          dimension: "TOKEN" as const,
          unitQuantity: 1000,
        },
      },
      {
        id: "groq-record",
        provider: "GROQ",
        providerModelId: "openai/gpt-oss-20b",
        name: "GPT-OSS 20B",
        description: "Groq character model",
        mediaKind: "TEXT",
        contextWindow: 131072,
        maxTokens: null,
        flags: { reasoning: false, fast: true },
        tasks: ["character-chat" as const],
        pricing: {
          priceVersionId: "price-2",
          dimension: "TOKEN" as const,
          unitQuantity: 1000,
        },
      },
    ],
  };

  it("prefers canonical ProviderModel ids and accepts unique legacy ids", () => {
    expect(selectStudioModelBySelection(discovery, "groq-record").id).toBe(
      "groq-record",
    );
    expect(
      selectStudioModelBySelection(discovery, "openai/gpt-oss-20b").id,
    ).toBe("groq-record");
  });

  it("fails closed for stale selections", () => {
    expect(() =>
      selectStudioModelBySelection(discovery, "retired-model"),
    ).toThrow(StudioModelUnavailableError);
  });

  it("rejects ambiguous legacy upstream ids", () => {
    expect(() =>
      selectStudioModelBySelection(
        {
          ...discovery,
          models: [
            ...discovery.models,
            { ...discovery.models[1]!, id: "duplicate-record" },
          ],
        },
        "openai/gpt-oss-20b",
      ),
    ).toThrow(/ambiguous/i);
  });
});
