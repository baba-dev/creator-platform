import type {
  MediaCropArea,
  QuarterTurn,
} from "@/components/studio/media-cropper";

const MAX_IMAGE_DIMENSION = 8192;
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_IMAGE_BYTES = 25_000_000;

export type ClientImageFormat = "png" | "jpeg" | "webp";

export function rotatedImageDimensions(
  width: number,
  height: number,
  rotation: QuarterTurn,
) {
  return rotation === 90 || rotation === 270
    ? { width: height, height: width }
    : { width, height };
}

export function validateClientImageOutput(width: number, height: number) {
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

function mimeType(format: ClientImageFormat) {
  return format === "jpeg" ? "image/jpeg" : `image/${format}`;
}

async function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Source image could not be decoded."));
    image.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: ClientImageFormat,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("The browser could not encode this image.")),
      mimeType(format),
      format === "png" ? undefined : 0.9,
    );
  });
}

export async function renderImageEdit({
  sourceUrl,
  crop,
  rotation,
  flipX,
  outputWidth,
  outputHeight,
  format,
}: {
  sourceUrl: string;
  crop: MediaCropArea;
  rotation: QuarterTurn;
  flipX: boolean;
  outputWidth?: number;
  outputHeight?: number;
  format: ClientImageFormat;
}) {
  if (typeof document === "undefined")
    throw new Error("Browser image rendering is unavailable.");

  const image = await loadImage(sourceUrl);
  const naturalWidth = image.naturalWidth;
  const naturalHeight = image.naturalHeight;
  validateClientImageOutput(naturalWidth, naturalHeight);

  const rotated = rotatedImageDimensions(
    naturalWidth,
    naturalHeight,
    rotation,
  );
  const fullCanvas = document.createElement("canvas");
  fullCanvas.width = rotated.width;
  fullCanvas.height = rotated.height;
  const fullContext = fullCanvas.getContext("2d", { alpha: true });
  if (!fullContext) throw new Error("Browser canvas is unavailable.");

  fullContext.save();
  fullContext.translate(rotated.width / 2, rotated.height / 2);
  if (flipX) fullContext.scale(-1, 1);
  fullContext.rotate((rotation * Math.PI) / 180);
  fullContext.drawImage(
    image,
    -naturalWidth / 2,
    -naturalHeight / 2,
    naturalWidth,
    naturalHeight,
  );
  fullContext.restore();

  const left = Math.max(0, Math.round(crop.x));
  const top = Math.max(0, Math.round(crop.y));
  const cropWidth = Math.min(
    rotated.width - left,
    Math.max(1, Math.round(crop.width)),
  );
  const cropHeight = Math.min(
    rotated.height - top,
    Math.max(1, Math.round(crop.height)),
  );
  if (cropWidth < 1 || cropHeight < 1)
    throw new Error("Choose a valid crop area.");

  const width = Math.round(outputWidth ?? cropWidth);
  const height = Math.round(outputHeight ?? cropHeight);
  validateClientImageOutput(width, height);

  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const outputContext = output.getContext("2d", { alpha: format !== "jpeg" });
  if (!outputContext) throw new Error("Browser canvas is unavailable.");

  outputContext.drawImage(
    fullCanvas,
    left,
    top,
    cropWidth,
    cropHeight,
    0,
    0,
    width,
    height,
  );

  const blob = await canvasToBlob(output, format);
  if (blob.size > MAX_IMAGE_BYTES)
    throw new Error("Edited image exceeds the 25 MB output limit.");
  return blob;
}
