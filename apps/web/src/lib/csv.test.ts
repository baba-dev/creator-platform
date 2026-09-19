import { describe, expect, it } from "vitest";

import { escapeCsvCell } from "./csv";

describe("CSV export safety", () => {
  it("escapes RFC 4180 control characters", () => {
    expect(escapeCsvCell('Bank "A", Muscat')).toBe('"Bank ""A"", Muscat"');
  });

  it("neutralizes spreadsheet formulas", () => {
    expect(escapeCsvCell("=1+1")).toBe("'=1+1");
    expect(escapeCsvCell("  +1+1")).toBe("'  +1+1");
  });
});
