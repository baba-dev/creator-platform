/**
 * Pure TypeScript Adobe Photoshop (.psd) binary serializer.
 * Supports multi-layer composition with dimensions, channel data,
 * opacity, visibility, blend modes, and layer names.
 * Zero external dependencies.
 */

export interface PsdLayerInput {
  name: string;
  width: number;
  height: number;
  top?: number;
  left?: number;
  opacity?: number; // 0 to 255 (default 255)
  visible?: boolean; // default true
  blendMode?: "norm" | "mul " | "scrn" | "over"; // default "norm"
  /**
   * RGBA pixel data as a Uint8ClampedArray or Uint8Array of length (width * height * 4).
   */
  rgbaData: Uint8Array | Uint8ClampedArray;
}

export interface PsdExportOptions {
  width: number;
  height: number;
  layers: PsdLayerInput[];
}

class ByteWriter {
  private buffer: Uint8Array;
  private offset: number = 0;

  constructor(initialCapacity = 1024 * 1024) {
    this.buffer = new Uint8Array(initialCapacity);
  }

  private ensureCapacity(additionalBytes: number) {
    if (this.offset + additionalBytes > this.buffer.length) {
      const newCapacity = Math.max(
        this.buffer.length * 2,
        this.offset + additionalBytes + 65536,
      );
      const next = new Uint8Array(newCapacity);
      next.set(this.buffer);
      this.buffer = next;
    }
  }

  writeUint8(val: number) {
    this.ensureCapacity(1);
    this.buffer[this.offset++] = val & 0xff;
  }

  writeInt16BE(val: number) {
    this.ensureCapacity(2);
    this.buffer[this.offset++] = (val >> 8) & 0xff;
    this.buffer[this.offset++] = val & 0xff;
  }

  writeUint16BE(val: number) {
    this.writeInt16BE(val);
  }

  writeUint32BE(val: number) {
    this.ensureCapacity(4);
    this.buffer[this.offset++] = (val >>> 24) & 0xff;
    this.buffer[this.offset++] = (val >>> 16) & 0xff;
    this.buffer[this.offset++] = (val >>> 8) & 0xff;
    this.buffer[this.offset++] = val & 0xff;
  }

  writeBytes(bytes: Uint8Array | Uint8ClampedArray | number[]) {
    this.ensureCapacity(bytes.length);
    if (bytes instanceof Uint8Array || bytes instanceof Uint8ClampedArray) {
      this.buffer.set(bytes, this.offset);
      this.offset += bytes.length;
    } else {
      for (let i = 0; i < bytes.length; i++) {
        this.buffer[this.offset++] = bytes[i]! & 0xff;
      }
    }
  }

  writeAscii(str: string) {
    this.ensureCapacity(str.length);
    for (let i = 0; i < str.length; i++) {
      this.buffer[this.offset++] = str.charCodeAt(i) & 0x7f;
    }
  }

  writePascalString(str: string, padTo = 4): number {
    const len = Math.min(str.length, 255);
    this.writeUint8(len);
    for (let i = 0; i < len; i++) {
      this.writeUint8(str.charCodeAt(i));
    }
    const total = 1 + len;
    const remainder = total % padTo;
    const pad = remainder === 0 ? 0 : padTo - remainder;
    for (let i = 0; i < pad; i++) {
      this.writeUint8(0);
    }
    return total + pad;
  }

  get length(): number {
    return this.offset;
  }

  toUint8Array(): Uint8Array {
    return this.buffer.slice(0, this.offset);
  }
}

/**
 * Builds an Adobe Photoshop (.psd) file buffer from layers.
 */
export function buildPsdBuffer(options: PsdExportOptions): Uint8Array {
  const { width, height, layers } = options;
  if (!layers.length) {
    throw new Error("At least one layer is required for PSD export.");
  }

  const out = new ByteWriter();

  // 1. FILE HEADER (26 bytes)
  out.writeAscii("8BPS"); // Signature
  out.writeUint16BE(1); // Version = 1
  for (let i = 0; i < 6; i++) out.writeUint8(0); // Reserved 6 bytes
  out.writeUint16BE(4); // 4 Channels: R, G, B, A
  out.writeUint32BE(height); // Height
  out.writeUint32BE(width); // Width
  out.writeUint16BE(8); // Depth = 8 bits
  out.writeUint16BE(3); // ColorMode = 3 (RGB)

  // 2. COLOR MODE DATA SECTION
  out.writeUint32BE(0); // Length = 0 for RGB

  // 3. IMAGE RESOURCES SECTION
  out.writeUint32BE(0); // Length = 0 (no extra resources needed for standard compatibility)

  // 4. LAYER AND MASK INFORMATION SECTION
  const layerInfoWriter = new ByteWriter();
  layerInfoWriter.writeInt16BE(layers.length); // Layer count (positive int16)

  // Layer records
  for (const layer of layers) {
    const top = layer.top ?? 0;
    const left = layer.left ?? 0;
    const bottom = top + layer.height;
    const right = left + layer.width;

    layerInfoWriter.writeUint32BE(top);
    layerInfoWriter.writeUint32BE(left);
    layerInfoWriter.writeUint32BE(bottom);
    layerInfoWriter.writeUint32BE(right);

    // Number of channels: 4 (R, G, B, A)
    layerInfoWriter.writeUint16BE(4);

    // Channel Information records (6 bytes each)
    // Channel IDs: 0 = Red, 1 = Green, 2 = Blue, -1 = Alpha
    const channelBytes = 2 + layer.width * layer.height; // 2 bytes compression + raw pixels
    const channelIds = [0, 1, 2, -1];
    for (const chId of channelIds) {
      layerInfoWriter.writeInt16BE(chId);
      layerInfoWriter.writeUint32BE(channelBytes);
    }

    // Blend mode
    layerInfoWriter.writeAscii("8BIM");
    const mode = layer.blendMode ?? "norm";
    layerInfoWriter.writeAscii(mode);

    // Opacity
    const opacity =
      layer.opacity !== undefined
        ? Math.min(255, Math.max(0, layer.opacity))
        : 255;
    layerInfoWriter.writeUint8(opacity);

    // Clipping: 0 = base
    layerInfoWriter.writeUint8(0);

    // Flags: bit 1 is visibility (0 = visible, 2 = hidden)
    const flags = layer.visible === false ? 0x02 : 0x00;
    layerInfoWriter.writeUint8(flags);

    // Filler byte
    layerInfoWriter.writeUint8(0);

    // Extra data length
    const extraWriter = new ByteWriter();
    // Layer mask data: length = 0
    extraWriter.writeUint32BE(0);
    // Layer blending ranges: length = 0
    extraWriter.writeUint32BE(0);
    // Layer name (Pascal string 4-byte padded)
    extraWriter.writePascalString(layer.name, 4);

    const extraBytes = extraWriter.toUint8Array();
    layerInfoWriter.writeUint32BE(extraBytes.length);
    layerInfoWriter.writeBytes(extraBytes);
  }

  // Channel image data for each layer
  for (const layer of layers) {
    const pixelCount = layer.width * layer.height;
    const rChannel = new Uint8Array(pixelCount);
    const gChannel = new Uint8Array(pixelCount);
    const bChannel = new Uint8Array(pixelCount);
    const aChannel = new Uint8Array(pixelCount);

    const rgba = layer.rgbaData;
    for (let p = 0; p < pixelCount; p++) {
      const idx = p * 4;
      rChannel[p] = rgba[idx] ?? 0;
      gChannel[p] = rgba[idx + 1] ?? 0;
      bChannel[p] = rgba[idx + 2] ?? 0;
      aChannel[p] = rgba[idx + 3] ?? 255;
    }

    // Write R, G, B, A in order matching channel IDs (0, 1, 2, -1)
    const channels = [rChannel, gChannel, bChannel, aChannel];
    for (const ch of channels) {
      layerInfoWriter.writeUint16BE(0); // Compression = 0 (Raw data)
      layerInfoWriter.writeBytes(ch);
    }
  }

  // Wrap Layer Info inside Layer and Mask Info section
  const layerInfoBytes = layerInfoWriter.toUint8Array();
  // Total Layer & Mask Section length = 4 (length field) + layerInfoBytes.length
  out.writeUint32BE(4 + layerInfoBytes.length);
  out.writeUint32BE(layerInfoBytes.length);
  out.writeBytes(layerInfoBytes);

  // 5. GLOBAL COMPOSITE IMAGE DATA SECTION (Merged Preview)
  // Planar raw data for composite: 2 bytes compression = 0, followed by R, G, B, A channels
  out.writeUint16BE(0); // Compression = 0 (Raw)
  const totalPixels = width * height;
  const compR = new Uint8Array(totalPixels);
  const compG = new Uint8Array(totalPixels);
  const compB = new Uint8Array(totalPixels);
  const compA = new Uint8Array(totalPixels);

  // Initialize white/transparent composite
  compR.fill(255);
  compG.fill(255);
  compB.fill(255);
  compA.fill(255);

  // Blend visible layers into composite
  for (const layer of layers) {
    if (layer.visible === false) continue;
    const lTop = layer.top ?? 0;
    const lLeft = layer.left ?? 0;
    const lWidth = layer.width;
    const lHeight = layer.height;
    const lRgba = layer.rgbaData;
    const lOpacity = (layer.opacity ?? 255) / 255;

    for (let ly = 0; ly < lHeight; ly++) {
      const cy = lTop + ly;
      if (cy < 0 || cy >= height) continue;
      for (let lx = 0; lx < lWidth; lx++) {
        const cx = lLeft + lx;
        if (cx < 0 || cx >= width) continue;

        const lIdx = (ly * lWidth + lx) * 4;
        const cIdx = cy * width + cx;

        const lr = lRgba[lIdx] ?? 0;
        const lg = lRgba[lIdx + 1] ?? 0;
        const lb = lRgba[lIdx + 2] ?? 0;
        const la = ((lRgba[lIdx + 3] ?? 255) / 255) * lOpacity;

        const cr = compR[cIdx]!;
        const cg = compG[cIdx]!;
        const cb = compB[cIdx]!;

        // Simple normal alpha composite over destination
        compR[cIdx] = Math.round(lr * la + cr * (1 - la));
        compG[cIdx] = Math.round(lg * la + cg * (1 - la));
        compB[cIdx] = Math.round(lb * la + cb * (1 - la));
      }
    }
  }

  out.writeBytes(compR);
  out.writeBytes(compG);
  out.writeBytes(compB);
  out.writeBytes(compA);

  return out.toUint8Array();
}

/**
 * Initiates a browser file download of a generated PSD buffer.
 */
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
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".psd") ? filename : `${filename}.psd`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
