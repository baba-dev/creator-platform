import { describe, expect, it } from "vitest";
import { parseMediaEnv } from "../src/index";

describe("media containment settings", () => {
  it("defaults to enabled processing with conservative bounds", () => {
    expect(parseMediaEnv({})).toEqual({
      MEDIA_PROCESSING_ENABLED: true,
      MEDIA_THREADS: 1,
      MEDIA_DERIVATIVE_TIMEOUT_MS: 60000,
    });
    expect(
      parseMediaEnv({ MEDIA_PROCESSING_ENABLED: "false" })
        .MEDIA_PROCESSING_ENABLED,
    ).toBe(false);
  });
  it.each([
    { MEDIA_THREADS: "0" },
    { MEDIA_THREADS: "3" },
    { MEDIA_DERIVATIVE_TIMEOUT_MS: "1" },
    { MEDIA_DERIVATIVE_TIMEOUT_MS: "120001" },
    { MEDIA_PROCESSING_ENABLED: "yes" },
  ])("rejects invalid bounds: %j", (settings) => {
    expect(() => parseMediaEnv(settings)).toThrow();
  });
});
