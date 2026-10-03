import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  issueGenerationQuote,
  quoteParameters,
  verifyGenerationQuote,
} from "../src/quote-contract";
const now = new Date("2026-09-30T00:00:00Z");
const context = {
  organizationId: "org",
  userId: "user",
  modelId: "model",
  priceVersionId: "price",
  parameters: quoteParameters("VIDEO", {
    durationSeconds: 5,
    resolution: "720p",
    aspectRatio: "16:9",
  }),
};
beforeEach(() =>
  vi.stubEnv(
    "AUTH_SECRET",
    "test-only-quote-secret-with-at-least-32-characters",
  ),
);
afterEach(() => vi.unstubAllEnvs());
describe("accepted generation quotes", () => {
  it("accepts an authentic bound ceiling and rejects overcharging", () => {
    const quote = issueGenerationQuote(context, 1000n, now);
    expect(() =>
      verifyGenerationQuote(quote.quoteToken, context, 1000n, now),
    ).not.toThrow();
    expect(() =>
      verifyGenerationQuote(quote.quoteToken, context, 1001n, now),
    ).toThrow("Quote expired or settings changed");
  });
  it("rejects tampering, expiry, replay across tenants/users/models/prices and changed settings", () => {
    const quote = issueGenerationQuote(context, 1000n, now);
    expect(() =>
      verifyGenerationQuote(quote.quoteToken + "x", context, 1000n, now),
    ).toThrow();
    expect(() =>
      verifyGenerationQuote(
        quote.quoteToken,
        context,
        1000n,
        new Date(now.getTime() + 300000),
      ),
    ).toThrow();
    for (const key of [
      "organizationId",
      "userId",
      "modelId",
      "priceVersionId",
    ] as const)
      expect(() =>
        verifyGenerationQuote(
          quote.quoteToken,
          { ...context, [key]: "other" },
          1000n,
          now,
        ),
      ).toThrow();
    expect(() =>
      verifyGenerationQuote(
        quote.quoteToken,
        {
          ...context,
          parameters: quoteParameters("VIDEO", { durationSeconds: 10 }),
        },
        1000n,
        now,
      ),
    ).toThrow();
  });
  it("binds transcription quotes to source asset, language, and trusted duration", () => {
    const parameters = quoteParameters("VOICE", {
      transcription: true,
      sourceAssetId: "asset-audio-1",
      language: "en",
      billableQuantity: 61,
    });
    expect(parameters).toEqual({
      transcription: true,
      sourceAssetId: "asset-audio-1",
      language: "en",
      billableQuantity: 61,
    });

    const transcriptionContext = {
      ...context,
      parameters,
    };
    const quote = issueGenerationQuote(transcriptionContext, 100n, now);
    expect(() =>
      verifyGenerationQuote(quote.quoteToken, transcriptionContext, 100n, now),
    ).not.toThrow();
    expect(() =>
      verifyGenerationQuote(
        quote.quoteToken,
        {
          ...transcriptionContext,
          parameters: quoteParameters("VOICE", {
            transcription: true,
            sourceAssetId: "asset-audio-2",
            language: "en",
            billableQuantity: 61,
          }),
        },
        100n,
        now,
      ),
    ).toThrow();
  });

  it("canonicalizes voice text and matches quote image units to generation outputCount", () => {
    expect(quoteParameters("VOICE", { text: "  Hello world  " })).toEqual(
      quoteParameters("VOICE", { text: "Hello world" }),
    );
    expect(quoteParameters("IMAGE", { units: 4 })).toEqual(
      quoteParameters("IMAGE", { outputCount: 4 }),
    );
  });
});
