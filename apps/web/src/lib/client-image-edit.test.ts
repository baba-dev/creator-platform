import { describe, expect, it } from "vitest";
import { validateClientImageDimensions } from "./client-image-edit";

describe("client image editor bounds", () => {
  it("accepts normal browser export sizes", () => {
    expect(() => validateClientImageDimensions(1080, 1920)).not.toThrow();
    expect(() => validateClientImageDimensions(4096, 4096)).not.toThrow();
  });

  it("rejects dimensions that could exhaust a browser canvas", () => {
    expect(() => validateClientImageDimensions(0, 1080)).toThrow();
    expect(() => validateClientImageDimensions(9000, 1080)).toThrow();
    expect(() => validateClientImageDimensions(8192, 8192)).toThrow();
  });
});
