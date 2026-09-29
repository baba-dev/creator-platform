import { z } from "zod";

export const MAX_EDITED_IMAGE_BYTES = 25_000_000n;
export const MAX_IMAGE_DIMENSION = 8192;
export const MAX_IMAGE_PIXELS = 40_000_000;

const dimension = z.number().int().min(1).max(MAX_IMAGE_DIMENSION);

export const imageTransformSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("crop"),
      x: z.number().int().min(0),
      y: z.number().int().min(0),
      width: dimension,
      height: dimension,
    })
    .strict(),
  z
    .object({
      kind: z.literal("resize"),
      width: dimension,
      height: dimension,
      fit: z.enum(["contain", "cover", "fill"]).default("contain"),
    })
    .strict(),
  z
    .object({
      kind: z.literal("scale"),
      factor: z.union([
        z.literal(0.25),
        z.literal(0.5),
        z.literal(0.75),
        z.literal(2),
        z.literal(4),
      ]),
    })
    .strict(),
]);

export const imageOperationRequestSchema = z
  .object({
    organizationId: z.string().min(1).max(100),
    sourceAssetId: z.string().min(1).max(100),
    idempotencyKey: z.uuid(),
    transform: imageTransformSchema,
    format: z.enum(["png", "jpeg", "webp"]).default("png"),
  })
  .strict();

export type ImageOperationRequest = z.infer<typeof imageOperationRequestSchema>;

export function validateImageOutputDimensions(
  width: number,
  height: number,
): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    throw new Error("Image dimensions exceed the supported editing limit.");
  }
}

export function transformedDimensions(
  source: { width: number; height: number },
  transform: z.infer<typeof imageTransformSchema>,
): { width: number; height: number } {
  validateImageOutputDimensions(source.width, source.height);
  if (transform.kind === "crop") {
    if (
      transform.x + transform.width > source.width ||
      transform.y + transform.height > source.height
    ) {
      throw new Error("Crop must remain inside the source image.");
    }
    return { width: transform.width, height: transform.height };
  }
  const result =
    transform.kind === "resize"
      ? { width: transform.width, height: transform.height }
      : {
          width: Math.round(source.width * transform.factor),
          height: Math.round(source.height * transform.factor),
        };
  validateImageOutputDimensions(result.width, result.height);
  return result;
}
