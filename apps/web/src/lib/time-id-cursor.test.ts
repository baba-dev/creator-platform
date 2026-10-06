import { describe, expect, it } from "vitest";

import { decodeTimeIdCursor, encodeTimeIdCursor } from "./time-id-cursor";

describe("time/id pagination cursor", () => {
  it("round-trips timestamp and stable tie-break id", () => {
    const at = new Date("2026-10-06T10:20:30.123Z");
    const encoded = encodeTimeIdCursor(at, "row_123");

    expect(decodeTimeIdCursor(encoded)).toEqual({ at, id: "row_123" });
  });

  it("accepts legacy ISO cursors during rolling deployment", () => {
    const decoded = decodeTimeIdCursor("2026-10-06T10:20:30.123Z");

    expect(decoded?.at.toISOString()).toBe("2026-10-06T10:20:30.123Z");
    expect(decoded?.id).toBeNull();
  });

  it("rejects malformed cursors", () => {
    expect(decodeTimeIdCursor("not-a-cursor")).toBeNull();
  });
});
