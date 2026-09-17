import { describe, expect, it } from "vitest";
import { formatBinaryBytes } from "./format-bytes";

describe("formatBinaryBytes", () => {
  it("formats exact and fractional binary units using bigint", () => {
    expect(formatBinaryBytes(0n)).toBe("0 bytes");
    expect(formatBinaryBytes(1_073_741_824n)).toBe("1.0 GiB");
    expect(formatBinaryBytes(1_610_612_736n)).toBe("1.5 GiB");
  });
  it("rejects negative values", () =>
    expect(() => formatBinaryBytes(-1n)).toThrow(RangeError));
});
