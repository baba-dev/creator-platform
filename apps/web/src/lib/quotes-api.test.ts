import { calculateModelQuote, calculateVideoPricing } from "@aiwa/credits";
import { canSpendWithinMonthlyCap } from "@aiwa/organizations";
import { quoteRequestSchema } from "@aiwa/validation";
import { describe, expect, it } from "vitest";

describe("quotes API logic", () => {
  it("validates valid quote requests and defaults units to 1", () => {
    const valid = quoteRequestSchema.safeParse({
      organizationId: "c12345678901234567890",
      modelId: "seedream-5-lite",
    });

    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.units).toBe(1);
    }
  });

  it("calculates customer credit quotes according to active price version", () => {
    const seedream5LiteQuote = calculateModelQuote({
      providerCostMicroUsd: 54_000n,
      units: 1,
    });
    expect(seedream5LiteQuote.customerCredits).toBe(28n);

    const seedanceQuote = calculateModelQuote({
      providerCostMicroUsd: 468_000n,
      units: 2, // 10 seconds of video (2x 5s)
    });
    expect(seedanceQuote.customerCredits).toBe(480n);
  });

  it("calculates customer credit quotes honoring custom creditsPerBaisa snapshot", () => {
    const defaultQuote = calculateModelQuote({
      providerCostMicroUsd: 54_000n,
      units: 1,
      creditsPerBaisa: 1n,
    });
    expect(defaultQuote.customerCredits).toBe(28n);

    const doubledQuote = calculateModelQuote({
      providerCostMicroUsd: 54_000n,
      units: 1,
      creditsPerBaisa: 2n,
    });
    expect(doubledQuote.customerCredits).toBe(56n);
    expect(doubledQuote.creditsPerBaisa).toBe(2n);

    const fiveFoldQuote = calculateModelQuote({
      providerCostMicroUsd: 54_000n,
      units: 1,
      creditsPerBaisa: 5n,
    });
    expect(fiveFoldQuote.customerCredits).toBe(140n);
  });

  it("correctly determines whether member can spend within monthly budget cap", () => {
    const quoteCredits = 28n;

    // Member with 1000 credit cap and 900 spent -> can spend 28
    expect(canSpendWithinMonthlyCap(1000n, 900n, quoteCredits)).toBe(true);

    // Member with 1000 credit cap and 980 spent -> cannot spend 28
    expect(canSpendWithinMonthlyCap(1000n, 980n, quoteCredits)).toBe(false);

    // Member with no cap -> can spend
    expect(canSpendWithinMonthlyCap(null, 5000n, quoteCredits)).toBe(true);
  });

  it("validates quote requests with billableQuantity for character-based pricing", () => {
    const validVoiceQuote = quoteRequestSchema.safeParse({
      organizationId: "c12345678901234567890",
      modelId: "seed-tts-2.0",
      text: "A".repeat(2500),
    });
    expect(validVoiceQuote.success).toBe(true);
    if (validVoiceQuote.success) {
      expect(validVoiceQuote.data.text).toHaveLength(2500);
      expect(validVoiceQuote.data.units).toBe(1); // default
    }
  });

  it("validates quote requests with video parameters (duration, resolution, audio)", () => {
    const validVideoQuote = quoteRequestSchema.safeParse({
      organizationId: "c12345678901234567890",
      modelId: "seedance-2.5",
      durationSeconds: 10,
      resolution: "1080p",
      generateAudio: true,
    });
    expect(validVideoQuote.success).toBe(true);
    if (validVideoQuote.success) {
      expect(validVideoQuote.data.durationSeconds).toBe(10);
      expect(validVideoQuote.data.resolution).toBe("1080p");
      expect(validVideoQuote.data.generateAudio).toBe(true);
    }
  });

  it("calculates parameter-sensitive video quotes for 5s vs 10s and resolution", () => {
    // 5s 720p base Seedance 2.5
    const base5s = calculateVideoPricing({
      providerCostMicroUsd: 468_000n,
      durationSeconds: 5,
      resolution: "720p",
      pricingDimension: "SECOND",
      unitQuantity: 5,
    });
    expect(base5s.durationUnits).toBe(1n);
    expect(base5s.quote.customerCredits).toBe(240n);

    // 10s 720p (2 units duration)
    const base10s = calculateVideoPricing({
      providerCostMicroUsd: 468_000n,
      durationSeconds: 10,
      resolution: "720p",
      pricingDimension: "SECOND",
      unitQuantity: 5,
    });
    expect(base10s.durationUnits).toBe(2n);
    expect(base10s.quote.customerCredits).toBe(480n);

    // 10s 1080p with audio (2 units * 1.5 res * 1.2 audio = 3.6x provider cost)
    const full10s = calculateVideoPricing({
      providerCostMicroUsd: 468_000n,
      durationSeconds: 10,
      resolution: "1080p",
      generateAudio: true,
      pricingDimension: "SECOND",
      unitQuantity: 5,
    });
    expect(full10s.durationUnits).toBe(2n);
    expect(full10s.quote.customerCredits).toBe(864n);
  });

  it("restricts commercial pricing internals to finance-capable roles", async () => {
    const { hasPlatformPermission } = await import("@aiwa/authz");

    expect(hasPlatformPermission("USER", "payments:read")).toBe(false);
    expect(hasPlatformPermission("SUPPORT", "payments:read")).toBe(false);
    expect(hasPlatformPermission("OPERATOR", "payments:read")).toBe(false);

    expect(hasPlatformPermission("FINANCE_ADMIN", "payments:read")).toBe(true);
    expect(hasPlatformPermission("PLATFORM_ADMIN", "payments:read")).toBe(true);
    expect(hasPlatformPermission("PLATFORM_OWNER", "payments:read")).toBe(true);
  });
});
