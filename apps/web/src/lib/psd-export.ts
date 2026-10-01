/**
 * Browser-safe Adobe Photoshop PSD (version 1) serializer.
 *
 * The writer intentionally supports a focused subset needed by the layered
 * image desk: 8-bit RGBA documents, raster layers, opacity/visibility and the
 * normal/multiply/screen/overlay blend modes. It writes uncompressed planar
 * channel data for maximum interoperability and validates memory bounds before
 * allocating large buffers.
 */

export interface PsdLayerInput {
  name: string;
  width: number;
  height: number;
  top?: number;
  left?: number;
  opacity?: number;
  visible?: boolean;
  blendMode?: "norm" | "mul " | "scrn" | "over";
  rgbaData: Uint8Array | Uint8ClampedArray;
}

export interface PsdExportOptions {
  width: number;
  height: number;
  layers: PsdLayerInput[];
}

const MAX_PSD_DIMENSION = 8_192;
const MAX_CANVAS_PIXELS = 20_000_000;
const MAX_TOTAL_LAYER_PIXELS = 32_000_000;
const MAX_PSD_LAYERS = 64;
const MAX_SIGNED_INT32 = 2_147_483_647;
const MIN_SIGNED_INT32 = -2_147_483_648;

class ByteWriter {
  private buffer: Uint8Array;
  private offset = 0;

  constructor(initialCapacity = 1024 * 1024) {
    this.buffer = new Uint8Array(Math.max(64, initialCapacity));
  }

  private ensureCapacity(additionalBytes: number): void {
    if (!Number.isSafeInteger(additionalBytes) || additionalBytes < 0) {
      throw new RangeError("Invalid PSD buffer growth request.");
    }
    const required = this.offset + additionalBytes;
    if (required <= this.buffer.length) return;

    let nextCapacity = this.buffer.length;
    while (nextCapacity < required) {
      nextCapacity = Math.max(nextCapacity * 2, required);
      if (!Number.isSafeInteger(nextCapacity)) {
        throw new RangeError("PSD is too large to encode safely.");
      }
    }
    const next = new Uint8Array(nextCapacity);
    next.set(this.buffer);
    this.buffer = next;
  }

  writeUint8(value: number): void {
    this.ensureCapacity(1);
    this.buffer[this.offset++] = value & 0xff;
  }

  writeInt16BE(value: number): void {
    this.ensureCapacity(2);
    this.buffer[this.offset++] = (value >> 8) & 0xff;
    this.buffer[this.offset++] = value & 0xff;
  }

  writeUint16BE(value: number): void {
    this.writeInt16BE(value);
  }

  writeInt32BE(value: number): void {
    this.writeUint32BE(value >>> 0);
  }

  writeUint32BE(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
      throw new RangeError("PSD uint32 field is outside range.");
    }
    this.ensureCapacity(4);
    this.buffer[this.offset++] = (value >>> 24) & 0xff;
    this.buffer[this.offset++] = (value >>> 16) & 0xff;
    this.buffer[this.offset++] = (value >>> 8) & 0xff;
    this.buffer[this.offset++] = value & 0xff;
  }

  writeBytes(bytes: Uint8Array | Uint8ClampedArray): void {
    this.ensureCapacity(bytes.length);
    this.buffer.set(bytes, this.offset);
    this.offset += bytes.length;
  }

  writeAscii(value: string): void {
    this.ensureCapacity(value.length);
    for (let index = 0; index < value.length; index += 1) {
      this.buffer[this.offset++] = value.charCodeAt(index) & 0x7f;
    }
  }

  writePascalString(value: string, padTo = 4): void {
    const ascii = Array.from(value)
      .map((character) => {
        const code = character.charCodeAt(0);
        return code >= 32 && code <= 126 ? character : "?";
      })
      .join("");
    const length = Math.min(ascii.length, 255);
    this.writeUint8(length);
    for (let index = 0; index < length; index += 1) {
      this.writeUint8(ascii.charCodeAt(index));
    }
    const total = 1 + length;
    const padding = (padTo - (total % padTo)) % padTo;
    for (let index = 0; index < padding; index += 1) this.writeUint8(0);
  }

  writeRgbaChannel(
    rgba: Uint8Array | Uint8ClampedArray,
    channelOffset: number,
    pixelCount: number,
  ): void {
    this.writeUint16BE(0); // Raw/uncompressed channel data.
    this.ensureCapacity(pixelCount + (pixelCount % 2));
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      this.buffer[this.offset++] = rgba[pixel * 4 + channelOffset] ?? 0;
    }
    if (pixelCount % 2 !== 0) this.buffer[this.offset++] = 0;
  }

  get length(): number {
    return this.offset;
  }

  toUint8Array(): Uint8Array {
    return this.buffer.slice(0, this.offset);
  }
}

function assertIntegerInRange(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): void {
  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new RangeError(`${label} is outside the supported PSD range.`);
  }
}

function validateOptions(options: PsdExportOptions): void {
  assertIntegerInRange(options.width, 1, MAX_PSD_DIMENSION, "Canvas width");
  assertIntegerInRange(options.height, 1, MAX_PSD_DIMENSION, "Canvas height");
  if (options.width * options.height > MAX_CANVAS_PIXELS) {
    throw new RangeError("Canvas exceeds the browser-safe PSD pixel budget.");
  }
  if (options.layers.length < 1 || options.layers.length > MAX_PSD_LAYERS) {
    throw new RangeError(
      `PSD export requires between 1 and ${MAX_PSD_LAYERS} layers.`,
    );
  }

  let totalLayerPixels = 0;
  for (const layer of options.layers) {
    assertIntegerInRange(layer.width, 1, MAX_PSD_DIMENSION, "Layer width");
    assertIntegerInRange(layer.height, 1, MAX_PSD_DIMENSION, "Layer height");
    const top = layer.top ?? 0;
    const left = layer.left ?? 0;
    assertIntegerInRange(top, MIN_SIGNED_INT32, MAX_SIGNED_INT32, "Layer top");
    assertIntegerInRange(left, MIN_SIGNED_INT32, MAX_SIGNED_INT32, "Layer left");
    assertIntegerInRange(
      top + layer.height,
      MIN_SIGNED_INT32,
      MAX_SIGNED_INT32,
      "Layer bottom",
    );
    assertIntegerInRange(
      left + layer.width,
      MIN_SIGNED_INT32,
      MAX_SIGNED_INT32,
      "Layer right",
    );

    const pixelCount = layer.width * layer.height;
    if (layer.rgbaData.length !== pixelCount * 4) {
      throw new RangeError(
        `Layer "${layer.name}" RGBA data does not match its dimensions.`,
      );
    }
    totalLayerPixels += pixelCount;
    if (totalLayerPixels > MAX_TOTAL_LAYER_PIXELS) {
      throw new RangeError(
        "Layer stack exceeds the browser-safe PSD pixel budget.",
      );
    }

    if (
      layer.opacity !== undefined &&
      (!Number.isSafeInteger(layer.opacity) ||
        layer.opacity < 0 ||
        layer.opacity > 255)
    ) {
      throw new RangeError(
        `Layer "${layer.name}" opacity must be an integer from 0 to 255.`,
      );
    }
  }
}

function blendChannel(
  mode: PsdLayerInput["blendMode"],
  backdrop: number,
  source: number,
): number {
  switch (mode) {
    case "mul ":
      return (backdrop * source) / 255;
    case "scrn":
      return 255 - ((255 - backdrop) * (255 - source)) / 255;
    case "over":
      return backdrop < 128
        ? (2 * backdrop * source) / 255
        : 255 - (2 * (255 - backdrop) * (255 - source)) / 255;
    default:
      return source;
  }
}

function compositeVisibleLayers(
  width: number,
  height: number,
  layers: readonly PsdLayerInput[],
): [Uint8Array, Uint8Array, Uint8Array, Uint8Array] {
  const totalPixels = width * height;
  const red = new Uint8Array(totalPixels);
  const green = new Uint8Array(totalPixels);
  const blue = new Uint8Array(totalPixels);
  const alpha = new Uint8Array(totalPixels);

  for (const layer of layers) {
    if (layer.visible === false) continue;
    const layerTop = layer.top ?? 0;
    const layerLeft = layer.left ?? 0;
    const layerOpacity = (layer.opacity ?? 255) / 255;
    const mode = layer.blendMode ?? "norm";

    for (let layerY = 0; layerY < layer.height; layerY += 1) {
      const canvasY = layerTop + layerY;
      if (canvasY < 0 || canvasY >= height) continue;

      for (let layerX = 0; layerX < layer.width; layerX += 1) {
        const canvasX = layerLeft + layerX;
        if (canvasX < 0 || canvasX >= width) continue;

        const sourceIndex = (layerY * layer.width + layerX) * 4;
        const canvasIndex = canvasY * width + canvasX;
        const sourceAlpha =
          ((layer.rgbaData[sourceIndex + 3] ?? 255) / 255) * layerOpacity;
        if (sourceAlpha <= 0) continue;

        const backdropAlpha = alpha[canvasIndex]! / 255;
        const outputAlpha =
          sourceAlpha + backdropAlpha * (1 - sourceAlpha);

        const sourceChannels = [
          layer.rgbaData[sourceIndex] ?? 0,
          layer.rgbaData[sourceIndex + 1] ?? 0,
          layer.rgbaData[sourceIndex + 2] ?? 0,
        ] as const;
        const backdropChannels = [
          red[canvasIndex]!,
          green[canvasIndex]!,
          blue[canvasIndex]!,
        ] as const;
        const targetChannels = [red, green, blue] as const;

        for (let channel = 0; channel < 3; channel += 1) {
          const source = sourceChannels[channel]!;
          const backdrop = backdropChannels[channel]!;
          const blended = blendChannel(mode, backdrop, source);
          const premultiplied =
            (1 - sourceAlpha) * backdropAlpha * backdrop +
            sourceAlpha *
              ((1 - backdropAlpha) * source + backdropAlpha * blended);
          targetChannels[channel][canvasIndex] =
            outputAlpha > 0
              ? Math.round(premultiplied / outputAlpha)
              : 0;
        }
        alpha[canvasIndex] = Math.round(outputAlpha * 255);
      }
    }
  }

  return [red, green, blue, alpha];
}

/** Build a standards-framed PSD v1 byte buffer. */
export function buildPsdBuffer(options: PsdExportOptions): Uint8Array {
  validateOptions(options);
  const { width, height, layers } = options;

  const output = new ByteWriter();

  // File header.
  output.writeAscii("8BPS");
  output.writeUint16BE(1);
  for (let index = 0; index < 6; index += 1) output.writeUint8(0);
  output.writeUint16BE(4); // RGBA
  output.writeUint32BE(height);
  output.writeUint32BE(width);
  output.writeUint16BE(8);
  output.writeUint16BE(3); // RGB

  // Empty Color Mode Data and Image Resources sections.
  output.writeUint32BE(0);
  output.writeUint32BE(0);

  const layerInfo = new ByteWriter();
  // A negative count declares merged transparency in the first alpha channel.
  layerInfo.writeInt16BE(-layers.length);

  for (const layer of layers) {
    const top = layer.top ?? 0;
    const left = layer.left ?? 0;
    layerInfo.writeInt32BE(top);
    layerInfo.writeInt32BE(left);
    layerInfo.writeInt32BE(top + layer.height);
    layerInfo.writeInt32BE(left + layer.width);

    layerInfo.writeUint16BE(4);
    const pixelCount = layer.width * layer.height;
    const channelByteLength = 2 + pixelCount + (pixelCount % 2);
    for (const channelId of [0, 1, 2, -1]) {
      layerInfo.writeInt16BE(channelId);
      layerInfo.writeUint32BE(channelByteLength);
    }

    layerInfo.writeAscii("8BIM");
    layerInfo.writeAscii(layer.blendMode ?? "norm");
    layerInfo.writeUint8(layer.opacity ?? 255);
    layerInfo.writeUint8(0); // clipping
    layerInfo.writeUint8(layer.visible === false ? 0x02 : 0x00);
    layerInfo.writeUint8(0);

    const extra = new ByteWriter(128);
    extra.writeUint32BE(0); // layer mask data
    extra.writeUint32BE(0); // layer blending ranges
    extra.writePascalString(layer.name || "Layer", 4);
    const extraBytes = extra.toUint8Array();
    layerInfo.writeUint32BE(extraBytes.length);
    layerInfo.writeBytes(extraBytes);
  }

  for (const layer of layers) {
    const pixelCount = layer.width * layer.height;
    layerInfo.writeRgbaChannel(layer.rgbaData, 0, pixelCount);
    layerInfo.writeRgbaChannel(layer.rgbaData, 1, pixelCount);
    layerInfo.writeRgbaChannel(layer.rgbaData, 2, pixelCount);
    layerInfo.writeRgbaChannel(layer.rgbaData, 3, pixelCount);
  }

  // Adobe requires the layer-info section length to be even.
  if (layerInfo.length % 2 !== 0) layerInfo.writeUint8(0);
  const layerInfoBytes = layerInfo.toUint8Array();

  // Layer & Mask Information:
  // [4-byte layer-info length][layer-info][4-byte global-mask length = 0]
  const layerAndMaskLength = 4 + layerInfoBytes.length + 4;
  output.writeUint32BE(layerAndMaskLength);
  output.writeUint32BE(layerInfoBytes.length);
  output.writeBytes(layerInfoBytes);
  output.writeUint32BE(0);

  // Merged image data, raw planar RGBA.
  output.writeUint16BE(0);
  const [red, green, blue, alpha] = compositeVisibleLayers(
    width,
    height,
    layers,
  );
  output.writeBytes(red);
  output.writeBytes(green);
  output.writeBytes(blue);
  output.writeBytes(alpha);

  return output.toUint8Array();
}

export function downloadPsdFile(
  filename: string,
  options: PsdExportOptions,
): void {
  if (typeof window === "undefined") return;
  const bytes = buildPsdBuffer(options);
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: "image/vnd.adobe.photoshop",
  });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename.toLowerCase().endsWith(".psd")
      ? filename
      : `${filename}.psd`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
