import { describe, expect, it } from "vitest";

import { hasModelCapability, imageRequestSchema } from "../src/index";

describe("hasModelCapability", () => {
  it("reads the flat capability keys used by provider descriptors", () => {
    const capabilities = {
      "aspectRatio:1:1": true,
      "aspectRatio:16:9": true,
      "resolution:2K": true,
      "resolution:4K": true,
    };

    expect(hasModelCapability(capabilities, "aspectRatio:1:1")).toBe(true);
    expect(hasModelCapability(capabilities, "resolution:4K")).toBe(true);
    expect(hasModelCapability(capabilities, "aspectRatio:4:3")).toBe(false);
  });

  it("accepts 1K image requests at the shared admission boundary", () => {
    const parsed = imageRequestSchema.safeParse({
      organizationId: "org-1",
      modelId: "model-1",
      priceVersionId: "price-1",
      idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
      prompt: "A campaign image",
      aspectRatio: "16:9",
      resolution: "1K",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.resolution).toBe("1K");
  });

  it("accepts 1.5K image requests at the shared admission boundary", () => {
    const parsed = imageRequestSchema.safeParse({
      organizationId: "org-1",
      modelId: "model-1",
      priceVersionId: "price-1",
      idempotencyKey: "123e4567-e89b-42d3-a456-426614174001",
      prompt: "A precision edit",
      aspectRatio: "16:9",
      resolution: "1.5K",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.resolution).toBe("1.5K");
  });

  it("fails closed when capabilities are missing or malformed", () => {
    expect(hasModelCapability(null, "resolution:2K")).toBe(false);
    expect(hasModelCapability([], "resolution:2K")).toBe(false);
    expect(
      hasModelCapability({ "resolution:2K": "true" }, "resolution:2K"),
    ).toBe(false);
  });
});
