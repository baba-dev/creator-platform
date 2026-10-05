import { describe, expect, it } from "vitest";
import {
  rotatedImageDimensions,
  validateClientImageOutput,
} from "./client-image-edit";

describe("client image editing helpers", () => {
  it("swaps dimensions for quarter turns", () => {
    expect(rotatedImageDimensions(1920, 1080, 90)).toEqual({
      width: 1080,
      height: 1920,
    });
    expect(rotatedImageDimensions(1920, 1080, 180)).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it("keeps output dimensions inside the existing image safety envelope", () => {
    expect(() => validateClientImageOutput(4096, 4096)).not.toThrow();
    expect(() => validateClientImageOutput(8193, 100)).toThrow();
    expect(() => validateClientImageOutput(7000, 7000)).toThrow();
    expect(() => validateClientImageOutput(0, 100)).toThrow();
  });
});
