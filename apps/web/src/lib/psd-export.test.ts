import { describe, expect, it } from "vitest";
import { buildPsdBuffer } from "./psd-export";

describe("buildPsdBuffer", () => {
  it("generates a valid Adobe Photoshop (.psd) file binary header and layer records", () => {
    const width = 100;
    const height = 100;

    // Layer 1: Solid red 100x100
    const redLayerRgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      redLayerRgba[i * 4] = 255; // R
      redLayerRgba[i * 4 + 1] = 0; // G
      redLayerRgba[i * 4 + 2] = 0; // B
      redLayerRgba[i * 4 + 3] = 255; // A
    }

    // Layer 2: Semi-transparent blue 50x50 at (25, 25)
    const blueLayerWidth = 50;
    const blueLayerHeight = 50;
    const blueLayerRgba = new Uint8Array(blueLayerWidth * blueLayerHeight * 4);
    for (let i = 0; i < blueLayerWidth * blueLayerHeight; i++) {
      blueLayerRgba[i * 4] = 0; // R
      blueLayerRgba[i * 4 + 1] = 0; // G
      blueLayerRgba[i * 4 + 2] = 255; // B
      blueLayerRgba[i * 4 + 3] = 128; // A
    }

    const psdBytes = buildPsdBuffer({
      width,
      height,
      layers: [
        {
          name: "Background Red",
          width,
          height,
          top: 0,
          left: 0,
          opacity: 255,
          visible: true,
          rgbaData: redLayerRgba,
        },
        {
          name: "Blue Overlay",
          width: blueLayerWidth,
          height: blueLayerHeight,
          top: 25,
          left: 25,
          opacity: 200,
          visible: true,
          rgbaData: blueLayerRgba,
        },
      ],
    });

    expect(psdBytes).toBeInstanceOf(Uint8Array);
    expect(psdBytes.length).toBeGreaterThan(1000);

    // Verify '8BPS' header
    expect(String.fromCharCode(...psdBytes.slice(0, 4))).toBe("8BPS");

    // Version = 1
    const view = new DataView(
      psdBytes.buffer,
      psdBytes.byteOffset,
      psdBytes.byteLength,
    );
    expect(view.getUint16(4)).toBe(1);

    // Channels = 4
    expect(view.getUint16(12)).toBe(4);

    // Height = 100, Width = 100
    expect(view.getUint32(14)).toBe(height);
    expect(view.getUint32(18)).toBe(width);

    // Depth = 8
    expect(view.getUint16(22)).toBe(8);

    // ColorMode = 3 (RGB)
    expect(view.getUint16(24)).toBe(3);
  });

  it("throws when layers array is empty", () => {
    expect(() =>
      buildPsdBuffer({
        width: 100,
        height: 100,
        layers: [],
      }),
    ).toThrow("At least one layer is required for PSD export.");
  });
});
