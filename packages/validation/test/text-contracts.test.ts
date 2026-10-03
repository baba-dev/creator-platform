import { describe, expect, it } from "vitest";
import {
  chatMessageCreateSchema,
  isPricingDimensionSupportedForMedia,
  publishPriceVersionSchema,
  scriptUpdateSchema,
} from "../src/index";

describe("text and voice workspace validation contracts", () => {
  it("accepts autoVoice as part of the canonical chat message payload", () => {
    expect(
      chatMessageCreateSchema.parse({
        content: "Hello there",
        idempotencyKey: "123e4567-e89b-42d3-a456-426614174123",
        autoVoice: true,
      }).autoVoice,
    ).toBe(true);
  });

  it("round-trips durable screenplay voice metadata", () => {
    const parsed = scriptUpdateSchema.parse({
      expectedRevision: 1,
      content: {
        scenes: [
          {
            id: "scene-1",
            type: "dialogue",
            character: "NORA",
            text: "We should leave now.",
            audioJobId: "cm12345678901234567890",
            voiceKey: "charlotte",
          },
        ],
        voiceAssignments: {
          NORA: { voiceKey: "charlotte", speechRate: 1.1 },
        },
      },
    });

    expect(parsed.content?.scenes[0]?.audioJobId).toBe(
      "cm12345678901234567890",
    );
    expect(parsed.content?.voiceAssignments?.NORA?.voiceKey).toBe("charlotte");
  });

  it("requires a stable idempotency key for paid chat turns", () => {
    expect(() =>
      chatMessageCreateSchema.parse({
        content: "Hello there",
        autoVoice: false,
      }),
    ).toThrow();
  });

  it("requires the expected screenplay revision on updates", () => {
    expect(() =>
      scriptUpdateSchema.parse({
        content: {
          scenes: [
            {
              id: "scene-1",
              type: "dialogue",
              character: "NORA",
              text: "We should leave now.",
            },
          ],
        },
      }),
    ).toThrow();
  });

  it("accepts versioned BytePlus text token rate tables", () => {
    const parsed = publishPriceVersionSchema.parse({
      idempotencyKey: "123e4567-e89b-12d3-a456-426614174099",
      providerCostMicroUsd: "3000",
      targetMarginBps: 2500,
      pricingDimension: "TOKEN",
      usageRates: {
        estimator: "byteplus-text-v1",
        tiers: [
          {
            maxPromptTokens: 131072,
            inputMicroUsdPerMillionTokens: "500000",
            cachedInputMicroUsdPerMillionTokens: "100000",
            outputMicroUsdPerMillionTokens: "3000000",
          },
          {
            maxPromptTokens: 262144,
            inputMicroUsdPerMillionTokens: "1000000",
            cachedInputMicroUsdPerMillionTokens: "200000",
            outputMicroUsdPerMillionTokens: "6000000",
          },
        ],
      },
    });

    expect(parsed.usageRates?.estimator).toBe("byteplus-text-v1");
  });
});

describe("reasoning pricing validation", () => {
  it("allows request or token pricing for reasoning but not media-only dimensions", () => {
    expect(isPricingDimensionSupportedForMedia("REASONING", "REQUEST")).toBe(
      true,
    );
    expect(isPricingDimensionSupportedForMedia("REASONING", "TOKEN")).toBe(
      true,
    );
    expect(isPricingDimensionSupportedForMedia("REASONING", "SECOND")).toBe(
      false,
    );
    expect(isPricingDimensionSupportedForMedia("REASONING", "CHARACTER")).toBe(
      false,
    );
  });
});
