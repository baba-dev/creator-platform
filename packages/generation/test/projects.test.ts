import { describe, expect, it } from "vitest";

import {
  imageRequestSchema,
  videoRequestSchema,
  voiceRequestSchema,
} from "../src/index";

describe("project assignment request validation", () => {
  const common = {
    organizationId: "org-1",
    projectId: "project-1",
    modelId: "model-1",
    priceVersionId: "price-1",
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  };

  it("accepts project assignment for image, video and voice requests", () => {
    expect(
      imageRequestSchema.parse({
        ...common,
        prompt: "Image prompt",
        aspectRatio: "1:1",
        resolution: "2K",
      }).projectId,
    ).toBe("project-1");

    expect(
      videoRequestSchema.parse({
        ...common,
        prompt: "Video prompt",
        aspectRatio: "16:9",
        resolution: "1080p",
        durationSeconds: 5,
        generateAudio: false,
      }).projectId,
    ).toBe("project-1");

    expect(
      voiceRequestSchema.parse({
        ...common,
        text: "Hello",
        voiceKey: "jasper",
        speechRate: 1,
        format: "mp3",
      }).projectId,
    ).toBe("project-1");
  });

  it("allows no-project generation but rejects oversized project identifiers", () => {
    expect(
      imageRequestSchema.parse({
        ...common,
        projectId: null,
        prompt: "Image prompt",
        aspectRatio: "1:1",
        resolution: "2K",
      }).projectId,
    ).toBeNull();

    expect(() =>
      imageRequestSchema.parse({
        ...common,
        projectId: "p".repeat(101),
        prompt: "Image prompt",
        aspectRatio: "1:1",
        resolution: "2K",
      }),
    ).toThrow();
  });
});
