import { describe, expect, it } from "vitest";

import {
  formatMuscatCsvTimestamp,
  muscatLocalDateTimeToIso,
  toMuscatDateTimeLocalValue,
} from "./format-baisa";

describe("Muscat billing time", () => {
  it("renders UTC instants in Asia/Muscat", () => {
    const instant = new Date("2026-09-19T08:30:45.000Z");

    expect(toMuscatDateTimeLocalValue(instant)).toBe("2026-09-19T12:30");
    expect(formatMuscatCsvTimestamp(instant)).toBe(
      "2026-09-19 12:30:45 +04:00",
    );
  });

  it("converts Muscat wall-clock input to UTC", () => {
    expect(muscatLocalDateTimeToIso("2026-09-19T12:30")).toBe(
      "2026-09-19T08:30:00.000Z",
    );
  });

  it("rejects malformed local timestamps", () => {
    expect(() => muscatLocalDateTimeToIso("19/09/2026 12:30")).toThrow(
      RangeError,
    );
  });
});
