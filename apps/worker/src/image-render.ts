import {
  imageTransformSchema,
  MAX_EDITED_IMAGE_BYTES,
  MAX_IMAGE_PIXELS,
  transformedDimensions,
} from "@aiwa/assets/image-operations";
import sharp from "sharp";
import { z } from "zod";

const payloadSchema = z
  .object({
    transform: imageTransformSchema,
    format: z.enum(["png", "jpeg", "webp"]),
  })
  .strict();
/** Pure media transformation; the caller owns persistence and accounting. */
export async function renderEditedImage(bytes: Buffer, raw: unknown) {
  const payload = payloadSchema.parse(raw);
  const input = sharp(bytes, {
    failOn: "error",
    limitInputPixels: MAX_IMAGE_PIXELS,
  }).rotate();
  const metadata = await input.metadata();
  const width = metadata.autoOrient?.width ?? metadata.width;
  const height = metadata.autoOrient?.height ?? metadata.height;
  if (!width || !height)
    throw new Error("Source image dimensions are unavailable.");
  transformedDimensions({ width, height }, payload.transform);

  let pipeline = sharp(bytes, {
    failOn: "error",
    limitInputPixels: MAX_IMAGE_PIXELS,
  }).rotate();
  if (payload.transform.kind === "crop") {
    pipeline = pipeline.extract({
      left: payload.transform.x,
      top: payload.transform.y,
      width: payload.transform.width,
      height: payload.transform.height,
    });
  } else if (payload.transform.kind === "resize") {
    pipeline = pipeline.resize(
      payload.transform.width,
      payload.transform.height,
      { fit: payload.transform.fit, kernel: sharp.kernel.lanczos3 },
    );
  } else {
    pipeline = pipeline.resize(
      Math.round(width * payload.transform.factor),
      Math.round(height * payload.transform.factor),
      { kernel: sharp.kernel.lanczos3 },
    );
  }
  const encoded =
    payload.format === "jpeg"
      ? pipeline.jpeg({ quality: 90, mozjpeg: true })
      : payload.format === "webp"
        ? pipeline.webp({ quality: 90, effort: 4 })
        : pipeline.png({ compressionLevel: 8 });
  const result = await encoded.toBuffer({ resolveWithObject: true });
  if (BigInt(result.data.byteLength) > MAX_EDITED_IMAGE_BYTES)
    throw new Error("Edited image exceeds the 25 MB output limit.");
  return result;
}
