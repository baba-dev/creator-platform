import type { Prisma } from "@aiwa/db";
import { describe, expect, it } from "vitest";

import {
  modelSupportsTemplate,
  parseTemplateDefaults,
  parseTemplateVariables,
  resolveTemplatePrompt,
} from "./templates";

describe("generation templates", () => {
  const variables = parseTemplateVariables([
    {
      key: "topic",
      label: "Topic",
      type: "text",
      required: true,
    },
    {
      key: "mood",
      label: "Mood",
      type: "select",
      required: true,
      options: ["Bold", "Calm"],
      defaultValue: "Bold",
    },
  ] as Prisma.JsonValue);

  it("resolves only declared placeholders with normalized values", () => {
    expect(
      resolveTemplatePrompt(
        "Create {{mood}} campaign art about {{topic}}.",
        variables,
        { topic: "  Oman launch  " },
      ),
    ).toEqual({
      prompt: "Create Bold campaign art about Oman launch.",
      referenceAssetIds: [],
    });
  });

  it("rejects undeclared values", () => {
    expect(() =>
      resolveTemplatePrompt("Create {{topic}}.", variables, {
        topic: "Launch",
        injected: "ignored",
      }),
    ).toThrow("Unknown template variable");
  });

  it("rejects invalid select values", () => {
    expect(() =>
      resolveTemplatePrompt("Create {{mood}} {{topic}}.", variables, {
        topic: "Launch",
        mood: "Unexpected",
      }),
    ).toThrow("invalid option");
  });

  it("collects reference assets without interpolating their IDs", () => {
    const referenceVariables = parseTemplateVariables([
      {
        key: "product",
        label: "Product",
        type: "text",
        required: true,
      },
      {
        key: "reference",
        label: "Reference",
        type: "reference-image",
        required: true,
      },
    ] as Prisma.JsonValue);
    expect(
      resolveTemplatePrompt(
        "Create a campaign image for {{product}}.",
        referenceVariables,
        { product: "Watch", reference: "asset123" },
      ),
    ).toEqual({
      prompt: "Create a campaign image for Watch.",
      referenceAssetIds: ["asset123"],
    });
  });

  it("matches template defaults against live model capabilities", () => {
    const defaults = parseTemplateDefaults({
      aspectRatio: "16:9",
      resolution: "2K",
      outputCount: 2,
    } as Prisma.JsonValue);
    expect(
      modelSupportsTemplate(
        {
          mediaKind: "IMAGE",
          capabilities: {
            "aspectRatio:16:9": true,
            "resolution:2K": true,
            referenceImages: true,
            maxReferenceImages: 14,
            sequentialImages: true,
            maxGeneratedImages: 15,
            maxTotalInputOutputImages: 15,
          } as Prisma.JsonValue,
        },
        "IMAGE",
        defaults,
        1,
      ),
    ).toBe(true);

    expect(
      modelSupportsTemplate(
        {
          mediaKind: "IMAGE",
          capabilities: {
            "aspectRatio:1:1": true,
            "resolution:2K": true,
          } as Prisma.JsonValue,
        },
        "IMAGE",
        defaults,
      ),
    ).toBe(false);
  });

  it("enforces media-specific prompt limits", () => {
    const text2500 = "a".repeat(2500);
    const text1500 = "a".repeat(1500);
    const singleVar = parseTemplateVariables([
      { key: "t", label: "Text", type: "text", required: true },
    ] as Prisma.JsonValue);

    // Image/Video limit is 2000
    expect(() =>
      resolveTemplatePrompt("{{t}}", singleVar, { t: text2500 }, "IMAGE"),
    ).toThrow("too long");

    expect(
      resolveTemplatePrompt("{{t}}", singleVar, { t: text1500 }, "IMAGE").prompt
        .length,
    ).toBe(1500);

    // Voice allows up to 4096
    expect(
      resolveTemplatePrompt("{{t}}", singleVar, { t: text1500 }, "VOICE").prompt
        .length,
    ).toBe(1500);
  });

  it("checks sequentialImages and outputCount limits for IMAGE templates", () => {
    const defaults = parseTemplateDefaults({
      aspectRatio: "16:9",
      resolution: "2K",
      outputCount: 4,
    } as Prisma.JsonValue);

    // Fails when sequentialImages is not true
    expect(
      modelSupportsTemplate(
        {
          mediaKind: "IMAGE",
          capabilities: {
            "aspectRatio:16:9": true,
            "resolution:2K": true,
            sequentialImages: false,
            maxGeneratedImages: 4,
          } as Prisma.JsonValue,
        },
        "IMAGE",
        defaults,
      ),
    ).toBe(false);

    // Fails when outputCount exceeds maxGeneratedImages
    expect(
      modelSupportsTemplate(
        {
          mediaKind: "IMAGE",
          capabilities: {
            "aspectRatio:16:9": true,
            "resolution:2K": true,
            sequentialImages: true,
            maxGeneratedImages: 2,
          } as Prisma.JsonValue,
        },
        "IMAGE",
        defaults,
      ),
    ).toBe(false);

    // Fails when combined references and outputs exceed maxTotalInputOutputImages
    expect(
      modelSupportsTemplate(
        {
          mediaKind: "IMAGE",
          capabilities: {
            "aspectRatio:16:9": true,
            "resolution:2K": true,
            referenceImages: true,
            maxReferenceImages: 5,
            sequentialImages: true,
            maxGeneratedImages: 10,
            maxTotalInputOutputImages: 5,
          } as Prisma.JsonValue,
        },
        "IMAGE",
        defaults,
        3, // 3 + 4 = 7 > 5
      ),
    ).toBe(false);
  });
});
