import { describe, expect, it } from "vitest";
import {
  MEMBER_STORAGE_QUOTA_BYTES,
  ORGANIZATION_STORAGE_QUOTA_BYTES,
  StorageQuotaExceededError,
  assertStorageAllocationFits,
  availableStorageBytes,
  canSpendWithinMonthlyCap,
  muscatCalendarMonth,
  normalizeMemberEmail,
  usedStorageBytes,
} from "../src/index";

describe("organization domain", () => {
  it("normalizes membership lookup emails", () =>
    expect(normalizeMemberEmail(" Owner@Example.COM ")).toBe(
      "owner@example.com",
    ));
  it("counts non-deleted assets using bigint", () =>
    expect(
      usedStorageBytes([
        { byteSize: 4n, status: "READY" },
        { byteSize: 9n, status: "DELETED" },
        { byteSize: 3n, status: "QUARANTINED" },
      ]),
    ).toBe(7n));
  it("never reports negative available storage", () =>
    expect(availableStorageBytes(11n, 10n)).toBe(0n));
  it("rejects member quota overflow", () =>
    expect(() =>
      assertStorageAllocationFits(MEMBER_STORAGE_QUOTA_BYTES, 0n, 1n),
    ).toThrow(StorageQuotaExceededError));
  it("rejects organization quota overflow", () =>
    expect(() =>
      assertStorageAllocationFits(0n, ORGANIZATION_STORAGE_QUOTA_BYTES, 1n),
    ).toThrow(StorageQuotaExceededError));
  it("accepts null, zero, and positive monthly caps", () => {
    expect(canSpendWithinMonthlyCap(null, 100n, 100n)).toBe(true);
    expect(canSpendWithinMonthlyCap(0n, 0n, 1n)).toBe(false);
    expect(canSpendWithinMonthlyCap(10n, 5n, 5n)).toBe(true);
  });
  it("uses the Muscat calendar month", () => {
    const month = muscatCalendarMonth(new Date("2026-09-30T21:00:00Z"));
    expect(month.start.toISOString()).toBe("2026-09-30T20:00:00.000Z");
    expect(month.end.toISOString()).toBe("2026-10-31T20:00:00.000Z");
  });
});
