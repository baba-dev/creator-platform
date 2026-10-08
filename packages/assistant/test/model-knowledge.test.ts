import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock("@aiwa/db", () => ({
  db: { providerModel: { findMany: mocked.findMany } },
}));

import { getPixelModelCatalog, publicModelCapabilities } from "../src/model-knowledge";

const now = new Date("2026-10-09T00:00:00.000Z");
const environment = {
  BYTEPLUS_API_KEY: "configured",
  BYTEPLUS_SPEECH_API_KEY: "configured",
  GROQ_API_KEY: "configured",
};

function price(dimension = "REQUEST", credits = 35n) {
  return [{
    id: "price-1",
    pricingDimension: dimension,
    customerCredits: credits,
    unitQuantity: 1,
    usageRates: null,
  }];
}

function row(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    provider: "BYTEPLUS",
    providerModelId: "seedream-" + id,
    displayName: "Seedream " + id,
    description: "Image generation model " + id,
    mediaKind: "IMAGE",
    enabled: true,
    capabilities: { resolution: "2K", "task:image-generation": true, maxReferences: 10 },
    priceVersions: price(),
    ...overrides,
  };
}

describe("Pixel live model knowledge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.findMany.mockResolvedValue([]);
  });

  it("lists beyond the old 30-model limit and pages without dropping results", async () => {
    mocked.findMany.mockResolvedValue(Array.from({ length: 45 }, (_, i) => row(String(i))));
    const first = await getPixelModelCatalog({ page: 1, pageSize: 20 }, { now, environment });
    const third = await getPixelModelCatalog({ page: 3, pageSize: 20 }, { now, environment });
    expect(first.total).toBe(45);
    expect(first.models).toHaveLength(20);
    expect(first.hasMore).toBe(true);
    expect(third.models).toHaveLength(5);
    expect(third.hasMore).toBe(false);
    expect(first.models[0]?.pricing.baseCredits).toBe("35");
    expect(JSON.stringify(first)).not.toContain("35n");
  });

  it("hides unconfigured providers and invalidly priced text tasks", async () => {
    mocked.findMany.mockResolvedValue([
      row("ready"),
      row("not-configured", { provider: "CLOUDFLARE" }),
      row("bad-text", {
        provider: "GROQ",
        mediaKind: "TEXT",
        providerModelId: "text-bad",
        capabilities: { "task:chat": true },
        priceVersions: price("REQUEST"),
      }),
      row("good-text", {
        provider: "GROQ",
        mediaKind: "TEXT",
        providerModelId: "text-good",
        capabilities: { "task:chat": true, contextWindow: 2048 },
        priceVersions: price("TOKEN"),
      }),
      row("disabled", { enabled: false }),
    ]);
    // Enabled pricing is enforced by the DB where condition; the mock simulates only
    // matching rows except for the deliberately disabled fixture above.
    const result = await getPixelModelCatalog({}, { now, environment });
    expect(result.models.map((model) => model.id)).toContain("ready");
    expect(result.models.map((model) => model.id)).toContain("good-text");
    expect(result.models.map((model) => model.id)).not.toContain("not-configured");
    expect(result.models.map((model) => model.id)).not.toContain("bad-text");
    expect(result.models[0]?.pricing).not.toHaveProperty("providerCostMicroUsd");
    expect(result.models.find((model) => model.id === "good-text")?.tasks).toContain("Chat");
  });

  it("supports exact model detail lookup and case-insensitive search", async () => {
    mocked.findMany.mockResolvedValue([
      row("a", { providerModelId: "seedream-5-pro", displayName: "Seedream 5 Pro" }),
      row("b"),
    ]);
    const selected = await getPixelModelCatalog({ modelId: "seedream-5-pro" }, { now, environment });
    expect(selected.models).toHaveLength(1);
    expect(selected.models[0]?.id).toBe("a");
    const named = await getPixelModelCatalog({ query: "SEEDREAM 5 PRO" }, { now, environment });
    expect(named.models).toHaveLength(1);
    expect(named.filter.query).toBe("SEEDREAM 5 PRO");
  });

  it("does not leak credentials or arbitrary objects from metadata", () => {
    const caps = publicModelCapabilities({
      maxReferences: 10,
      resolution: "4K",
      "task:video-generation": true,
      supportedModes: ["text-to-video", "image-to-video"],
      apiKey: "secret-value",
      nested: { token: "secret-value" },
      endpoint: "https://private.example",
    });
    expect(caps).toEqual({
      maxReferences: 10,
      resolution: "4K",
      "task:video-generation": true,
      supportedModes: ["text-to-video", "image-to-video"],
    });
    expect(JSON.stringify(caps)).not.toContain("secret-value");
  });
});
