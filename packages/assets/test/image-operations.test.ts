import { describe, expect, it } from "vitest";
import {
  imageOperationRequestSchema,
  transformedDimensions,
} from "../src/image-operations";

describe("image operation admission", () => {
  it("rejects unknown fields and invalid operation parameters", () => {
    const base = {
      organizationId: "org",
      sourceAssetId: "asset",
      idempotencyKey: "2dd8f939-5738-456b-84c5-38b4b389a89b",
    };
    expect(
      imageOperationRequestSchema.safeParse({
        ...base,
        transform: { kind: "scale", factor: 2 },
        format: "webp",
      }).success,
    ).toBe(true);
    expect(
      imageOperationRequestSchema.safeParse({
        ...base,
        transform: { kind: "scale", factor: 16 },
      }).success,
    ).toBe(false);
    expect(
      imageOperationRequestSchema.safeParse({
        ...base,
        transform: {
          kind: "crop",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          url: "https://evil",
        },
      }).success,
    ).toBe(false);
  });

  it("enforces crop boundaries and output pixel limits", () => {
    expect(
      transformedDimensions(
        { width: 1200, height: 800 },
        { kind: "crop", x: 50, y: 70, width: 400, height: 300 },
      ),
    ).toEqual({ width: 400, height: 300 });
    expect(() =>
      transformedDimensions(
        { width: 1200, height: 800 },
        { kind: "crop", x: 900, y: 0, width: 400, height: 200 },
      ),
    ).toThrow(/Crop/);
    expect(() =>
      transformedDimensions(
        { width: 4000, height: 4000 },
        { kind: "scale", factor: 2 },
      ),
    ).toThrow(/dimensions/);
  });
});
