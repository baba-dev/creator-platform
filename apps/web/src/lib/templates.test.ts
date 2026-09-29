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
});
