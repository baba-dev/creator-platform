import { describe, expect, it } from "vitest";

import { clientChatModelReference } from "./chat-model-selection";
import type { PublicStudioModel } from "./studio-model-discovery";

const available: PublicStudioModel[] = [
  {
    id: "canonical-groq",
    provider: "GROQ",
    providerModelId: "openai/gpt-oss-20b",
    name: "GPT-OSS 20B",
    description: "Fast character chat",
    mediaKind: "TEXT",
    contextWindow: 131072,
    maxTokens: null,
    flags: { reasoning: false, fast: true },
    tasks: ["character-chat"],
    pricing: {
      priceVersionId: "price",
      dimension: "TOKEN",
      unitQuantity: 1000,
    },
  },
];

describe("chat model references", () => {
  it("keeps canonical ids pinned even if the model becomes unavailable", () => {
    expect(
      clientChatModelReference(
        {
          providerModelRecordId: "retired-record",
          modelId: "openai/gpt-oss-20b",
        },
        available,
      ),
    ).toEqual({
      modelId: "retired-record",
      modelAvailable: false,
      modelReference: "CANONICAL",
    });
  });

  it("maps a unique legacy upstream id to its canonical ProviderModel id", () => {
    expect(
      clientChatModelReference(
        { providerModelRecordId: null, modelId: "openai/gpt-oss-20b" },
        available,
      ),
    ).toEqual({
      modelId: "canonical-groq",
      modelAvailable: true,
      modelReference: "LEGACY",
    });
  });

  it("does not silently replace an unknown legacy preference", () => {
    expect(
      clientChatModelReference(
        { providerModelRecordId: null, modelId: "retired-provider-model" },
        available,
      ),
    ).toEqual({
      modelId: "retired-provider-model",
      modelAvailable: false,
      modelReference: "UNAVAILABLE",
    });
  });
});
