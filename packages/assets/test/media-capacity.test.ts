import { describe, expect, it } from "vitest";
import { withMediaCapacity } from "../src/media-capacity";

describe("shared native media capacity", () => {
  it("serializes independent callers and releases capacity after failure", async () => {
    let active = 0;
    let maximum = 0;
    const results = await Promise.allSettled(
      [true, false, false].map((fail) =>
        withMediaCapacity(async () => {
          active++;
          maximum = Math.max(maximum, active);
          try {
            await new Promise((resolve) => setTimeout(resolve, 10));
            if (fail) throw new Error("failed encode");
            return "encoded";
          } finally {
            active--;
          }
        }),
      ),
    );
    expect(maximum).toBe(1);
    expect(active).toBe(0);
    expect(results.map((result) => result.status)).toEqual([
      "rejected",
      "fulfilled",
      "fulfilled",
    ]);
  });

  it("allows nested probe/encode work without deadlocking its owning task", async () => {
    expect(
      await withMediaCapacity(() => withMediaCapacity(async () => "rendered")),
    ).toBe("rendered");
  });
});
