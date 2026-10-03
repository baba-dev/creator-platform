import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    providerModel: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
  estimateGeneration: vi.fn(),
  issueGenerationQuote: vi.fn(),
}));

vi.mock("@aiwa/db", () => ({ db: mocks.db }));
vi.mock("@aiwa/credits", () => ({
  estimateGeneration: mocks.estimateGeneration,
}));
vi.mock("@aiwa/generation", () => ({
  GenerationError: class GenerationError extends Error {
    constructor(
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  },
  issueGenerationQuote: mocks.issueGenerationQuote,
  normalizeTextMessagesForModel: (messages: unknown) => messages,
  quoteParameters: (_kind: string, parameters: unknown) => parameters,
}));

import { issueTextFeatureQuote } from "./text-feature-generation";

const model = {
  id: "canonical-groq",
  provider: "GROQ",
  providerModelId: "openai/gpt-oss-20b",
  displayName: "GPT-OSS 20B",
  capabilities: { characterChat: true },
  priceVersions: [{ id: "price-1" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.estimateGeneration.mockReturnValue({
    quote: { customerCredits: 8n },
    reservation: { customerCredits: 12n },
  });
  mocks.issueGenerationQuote.mockReturnValue({
    quoteToken: "signed",
    expiresAt: new Date("2026-10-03T12:00:00Z"),
  });
});

describe("canonical text feature quotes", () => {
  it("binds a canonical selection to the exact ProviderModel record", async () => {
    mocks.db.providerModel.findFirst.mockResolvedValue(model);

    const quote = await issueTextFeatureQuote({
      organizationId: "org-1",
      userId: "user-1",
      modelId: "canonical-groq",
      messages: [{ role: "user", content: "Hello" }],
      maxTokens: 512,
    });

    expect(mocks.db.providerModel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "canonical-groq" }),
      }),
    );
    expect(mocks.issueGenerationQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "canonical-groq",
        priceVersionId: "price-1",
      }),
      12n,
      expect.any(Date),
    );
    expect(quote.quotedModelId).toBe("canonical-groq");
    expect(quote.providerModelId).toBe("openai/gpt-oss-20b");
  });

  it("rejects ambiguous legacy upstream ids instead of picking a provider", async () => {
    mocks.db.providerModel.findMany.mockResolvedValue([
      { ...model, id: "groq-record" },
      { ...model, id: "another-provider-record", provider: "CLOUDFLARE" },
    ]);

    await expect(
      issueTextFeatureQuote({
        organizationId: "org-1",
        userId: "user-1",
        providerModelId: "shared-upstream-id",
        messages: [{ role: "user", content: "Hello" }],
        maxTokens: 512,
      }),
    ).rejects.toThrow(/ambiguous/i);
    expect(mocks.issueGenerationQuote).not.toHaveBeenCalled();
  });
});
