import { calculateModelQuote } from "@aiwa/credits";
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

  it("correctly determines whether member can spend within monthly budget cap", () => {
    const quoteCredits = 28n;

    // Member with 1000 credit cap and 900 spent -> can spend 28
    expect(canSpendWithinMonthlyCap(1000n, 900n, quoteCredits)).toBe(true);

    // Member with 1000 credit cap and 980 spent -> cannot spend 28
    expect(canSpendWithinMonthlyCap(1000n, 980n, quoteCredits)).toBe(false);

    // Member with no cap -> can spend
    expect(canSpendWithinMonthlyCap(null, 5000n, quoteCredits)).toBe(true);
  });
});
