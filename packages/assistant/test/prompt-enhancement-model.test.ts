import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  preference: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("@aiwa/db", () => ({
  db: {
    providerModel: { findMany: mocks.list },
    promptEnhancementPreference: {
      findUnique: mocks.preference,
      upsert: mocks.upsert,
      deleteMany: mocks.deleteMany,
    },
  },
}));
vi.mock("@aiwa/providers", () => ({
  getProviderRuntimeReadiness: () => ({ configured: true }),
  supportsStudioTask: () => true,
  STUDIO_TASK_DEFAULT_PROVIDER_MODEL_IDS: {
    "prompt-enhancement": "preferred-upstream",
  },
}));
vi.mock("@aiwa/credits", () => ({
  parseTextUsageRatesForProvider: vi.fn(),
}));

import {
  getPromptEnhancementModelTool,
  setPromptEnhancementModelTool,
} from "../src/tools/prompt-enhancement-model";

const ctx = {
  userId: "user-1",
  organizationId: "org-1",
  organizationSlug: "workspace",
  threadId: "pixel-thread",
  idempotencyKey: "request-1",
};

const models = [
  {
    id: "a",
    displayName: "Fast Reasoning",
    provider: "GROQ",
    providerModelId: "preferred-upstream",
    mediaKind: "TEXT",
    capabilities: { "task:prompt-enhancement": true },
    priceVersions: [{ pricingDimension: "REQUEST", usageRates: null }],
  },
  {
    id: "b",
    displayName: "High Quality",
    provider: "GEMINI",
    providerModelId: "gemini-pro",
    mediaKind: "TEXT",
    capabilities: { "task:prompt-enhancement": true },
    priceVersions: [{ pricingDimension: "REQUEST", usageRates: null }],
  },
];

describe("Pixel Prompt Enhance model selection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.list.mockResolvedValue(models);
    mocks.preference.mockResolvedValue(null);
    mocks.upsert.mockResolvedValue({});
    mocks.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("shows the live eligible models and preference", async () => {
    mocks.preference.mockResolvedValue({ modelId: "b" });
    const result = (await getPromptEnhancementModelTool.execute({}, ctx)) as {
      selected: { id: string };
      models: Array<{ id: string }>;
    };
    expect(result.selected.id).toBe("b");
    expect(result.models).toHaveLength(2);
  });

  it("allows a unique provider alias and persists an exact model ID", async () => {
    const result = (await setPromptEnhancementModelTool.execute(
      { model: "gemini" },
      ctx,
    )) as {
      selected: { id: string };
    };
    expect(result.selected.id).toBe("b");
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: {
        organizationId_userId: { organizationId: "org-1", userId: "user-1" },
      },
      create: { organizationId: "org-1", userId: "user-1", modelId: "b" },
      update: { modelId: "b" },
    });
  });

  it("does not mutate anything for unavailable or ambiguous input", async () => {
    const missing = (await setPromptEnhancementModelTool.execute(
      { model: "not-real" },
      ctx,
    )) as { unavailable: boolean };
    expect(missing.unavailable).toBe(true);
    const ambiguous = (await setPromptEnhancementModelTool.execute(
      { model: "i" },
      ctx,
    )) as { ambiguous: boolean };
    expect(ambiguous.ambiguous).toBe(true);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("resets to default for the requesting user only", async () => {
    await setPromptEnhancementModelTool.execute({ model: "default" }, ctx);
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1", userId: "user-1" },
    });
  });
});
