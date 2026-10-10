import { describe, expect, it } from "vitest";
import { publicCostBreakdown, retailMicroUsdApprox } from "./customer-cost-breakdown";

describe("customer-visible cost equivalence", () => {
  it("uses the quote's exact FX snapshot instead of a global rate", () => {
    // At 384.5 baisa / USD, 114 baisa is about 296,489 microUSD.
    expect(retailMicroUsdApprox(114n, 769n, 2n)).toBe("296489");
    expect(retailMicroUsdApprox(114n, 400n, 1n)).toBe("285000");
  });

  it("handles zero, extremely large and fractional retail equivalents using bigint", () => {
    expect(retailMicroUsdApprox(0n, 769n, 2n)).toBe("0");
    expect(BigInt(retailMicroUsdApprox(999999999999999n, 769n, 2n)) > 0n).toBe(true);
  });

  it("keeps max and estimated equivalents distinct and rejects invalid quotes", () => {
    const result = publicCostBreakdown(114n, 143n, {
      baisaNumerator: 769n,
      baisaDenominator: 2n,
    });
    expect(BigInt(result.maximumRetailMicroUsdApprox)).toBeGreaterThan(
      BigInt(result.estimatedRetailMicroUsdApprox),
    );
    expect(result.fxBaisaNumerator).toBe("769");
    expect(() => publicCostBreakdown(143n, 114n, {
      baisaNumerator: 769n,
      baisaDenominator: 2n,
    })).toThrow();
    expect(() => retailMicroUsdApprox(1n, 0n, 1n)).toThrow();
  });
});
