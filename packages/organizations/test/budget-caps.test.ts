import { describe, expect, it } from "vitest";

import { canSpendWithinMonthlyCap, muscatCalendarMonth } from "../src/index";

describe("budget caps and spending calculations", () => {
  it("enforces monthly cap boundaries strictly", () => {
    // Uncapped
    expect(canSpendWithinMonthlyCap(null, 500n, 100n)).toBe(true);

    // Exact limit
    expect(canSpendWithinMonthlyCap(1000n, 900n, 100n)).toBe(true);

    // Over limit by 1
    expect(canSpendWithinMonthlyCap(1000n, 900n, 101n)).toBe(false);

    // Zero cap cannot spend
    expect(canSpendWithinMonthlyCap(0n, 0n, 1n)).toBe(false);
    expect(canSpendWithinMonthlyCap(0n, 0n, 0n)).toBe(true);
  });

  it("calculates Muscat calendar month window correctly", () => {
    // Mid-month
    const midMonth = new Date("2026-09-17T10:00:00Z");
    const window = muscatCalendarMonth(midMonth);
    // Muscat is UTC+4. September 1 00:00 Muscat is August 31 20:00 UTC.
    expect(window.start.toISOString()).toBe("2026-08-31T20:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-09-30T20:00:00.000Z");
  });
});
