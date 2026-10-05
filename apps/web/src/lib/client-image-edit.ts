export type CropPixels = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ImageExportFormat = "png" | "jpeg" | "webp";

const MAX_IMAGE_DIMENSION = 8192;
const MAX_IMAGE_PIXELS = 40_000_000;

function radians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function rotatedSize(width: number, height: number, rotation: number) {
  const angle = radians(rotation);
  return {
    width:
      Math.abs(Math.cos(angle) * width) + Math.abs(Math.sin(angle) * height),
    height:
      Math.abs(Math.sin(angle) * width) + Math.abs(Math.cos(angle) * height),
  };
}

export function validateClientImageDimensions(width: number, height: number) {
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

async function loadImage(sourceUrl: string) {
  const response = await fetch(sourceUrl, {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("Source image could not be loaded.");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Browser could not encode the edited image.")),
      type,
      quality,
    );
  });
}

export async function renderClientImageEdit(input: {
  sourceUrl: string;
  crop: CropPixels;
  rotation: number;
  outputWidth: number;
  outputHeight: number;
  format: ImageExportFormat;
}): Promise<Blob> {
  validateClientImageDimensions(input.outputWidth, input.outputHeight);
  if (
    input.crop.x < 0 ||
    input.crop.y < 0 ||
    input.crop.width < 1 ||
    input.crop.height < 1
  ) {
    throw new Error("Choose a valid crop region.");
  }

  const image = await loadImage(input.sourceUrl);
  const bounds = rotatedSize(
    image.naturalWidth,
    image.naturalHeight,
    input.rotation,
  );

  const stage = document.createElement("canvas");
  stage.width = Math.max(1, Math.round(bounds.width));
  stage.height = Math.max(1, Math.round(bounds.height));
  validateClientImageDimensions(stage.width, stage.height);

  const stageContext = stage.getContext("2d", { alpha: true });
  if (!stageContext) throw new Error("Canvas editing is unavailable.");

  stageContext.translate(stage.width / 2, stage.height / 2);
  stageContext.rotate(radians(input.rotation));
  stageContext.translate(-image.naturalWidth / 2, -image.naturalHeight / 2);
  stageContext.drawImage(image, 0, 0);

  const cropX = Math.min(
    Math.max(0, Math.round(input.crop.x)),
    Math.max(0, stage.width - 1),
  );
  const cropY = Math.min(
    Math.max(0, Math.round(input.crop.y)),
    Math.max(0, stage.height - 1),
  );
  const cropWidth = Math.min(
    Math.max(1, Math.round(input.crop.width)),
    stage.width - cropX,
  );
  const cropHeight = Math.min(
    Math.max(1, Math.round(input.crop.height)),
    stage.height - cropY,
  );

  const output = document.createElement("canvas");
  output.width = input.outputWidth;
  output.height = input.outputHeight;
  const outputContext = output.getContext("2d", { alpha: true });
  if (!outputContext) throw new Error("Canvas editing is unavailable.");
  outputContext.imageSmoothingEnabled = true;
  outputContext.imageSmoothingQuality = "high";
  outputContext.drawImage(
    stage,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    input.outputWidth,
    input.outputHeight,
  );

  const mime =
    input.format === "jpeg"
      ? "image/jpeg"
      : input.format === "webp"
        ? "image/webp"
        : "image/png";
  return canvasBlob(output, mime, input.format === "png" ? undefined : 0.9);
}

export async function uploadClientImage(input: {
  organizationId: string;
  blob: Blob;
  filename: string;
}) {
  const form = new FormData();
  form.set("organizationId", input.organizationId);
  form.set(
    "file",
    new File([input.blob], input.filename, { type: input.blob.type }),
  );

  const response = await fetch("/api/assets/upload", {
    method: "POST",
    body: form,
  });
  const body = (await response.json()) as {
    asset?: { id: string };
    error?: string;
  };
  if (!response.ok || !body.asset?.id) {
    throw new Error(body.error ?? "Edited image could not be saved.");
  }
  return body.asset.id;
}
