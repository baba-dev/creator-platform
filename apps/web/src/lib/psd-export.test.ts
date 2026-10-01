import { describe, expect, it } from "vitest";

import { buildPsdBuffer } from "./psd-export";

function dataView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

describe("buildPsdBuffer", () => {
  it("writes a PSD v1 RGBA header and required layer/mask framing", () => {
    const rgba = new Uint8Array([
      255, 0, 0, 255,
      0, 255, 0, 128,
      0, 0, 255, 255,
      255, 255, 255, 255,
    ]);
    const bytes = buildPsdBuffer({
      width: 2,
      height: 2,
      layers: [
        {
          name: "Pixels",
          width: 2,
          height: 2,
          rgbaData: rgba,
        },
      ],
    });
    const view = dataView(bytes);

    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("8BPS");
    expect(view.getUint16(4)).toBe(1);
    expect(view.getUint16(12)).toBe(4);
    expect(view.getUint32(14)).toBe(2);
    expect(view.getUint32(18)).toBe(2);
    expect(view.getUint16(22)).toBe(8);
    expect(view.getUint16(24)).toBe(3);

    // Header 26 + color-mode length 4 + image-resources length 4.
    const layerAndMaskLength = view.getUint32(34);
    const layerInfoLength = view.getUint32(38);
    expect(layerInfoLength % 2).toBe(0);
    expect(layerAndMaskLength).toBe(4 + layerInfoLength + 4);

    // Layer count is negative to declare merged alpha/transparency.
    expect(view.getInt16(42)).toBe(-1);

    const globalMaskOffset = 42 + layerInfoLength;
    expect(view.getUint32(globalMaskOffset)).toBe(0);
    expect(view.getUint16(globalMaskOffset + 4)).toBe(0);
  });

  it("includes raw-channel padding in odd-sized layer channel lengths", () => {
    const bytes = buildPsdBuffer({
      width: 1,
      height: 1,
      layers: [
        {
          name: "Odd",
          width: 1,
          height: 1,
          rgbaData: new Uint8Array([10, 20, 30, 40]),
        },
      ],
    });
    const view = dataView(bytes);

    // Layer info begins at 42; count(2), rectangle(16), channel count(2),
    // then first channel record: id(2), byte length(4).
    expect(view.getUint16(60)).toBe(4);
    expect(view.getInt16(62)).toBe(0);
    expect(view.getUint32(64)).toBe(4); // compression(2) + pixel(1) + pad(1)
  });

  it("produces transparent merged pixels for a fully transparent source", () => {
    const bytes = buildPsdBuffer({
      width: 1,
      height: 1,
      layers: [
        {
          name: "Transparent",
          width: 1,
          height: 1,
          rgbaData: new Uint8Array([255, 0, 0, 0]),
        },
      ],
    });
    const view = dataView(bytes);
    const layerInfoLength = view.getUint32(38);
    const mergedImageOffset = 42 + layerInfoLength + 4;

    expect(view.getUint16(mergedImageOffset)).toBe(0);
    const rgbaPlanes = bytes.slice(mergedImageOffset + 2);
    expect(Array.from(rgbaPlanes)).toEqual([0, 0, 0, 0]);
  });

  it("rejects malformed pixel buffers and unsafe dimensions", () => {
    expect(() =>
      buildPsdBuffer({
        width: 100,
        height: 100,
        layers: [],
      }),
    ).toThrow("between 1 and");

    expect(() =>
      buildPsdBuffer({
        width: 1,
        height: 1,
        layers: [
          {
            name: "Bad",
            width: 1,
            height: 1,
            rgbaData: new Uint8Array([1, 2, 3]),
          },
        ],
      }),
    ).toThrow("RGBA data");

    expect(() =>
      buildPsdBuffer({
        width: 9_000,
        height: 1,
        layers: [
          {
            name: "Too wide",
            width: 1,
            height: 1,
            rgbaData: new Uint8Array([0, 0, 0, 255]),
          },
        ],
      }),
    ).toThrow("Canvas width");
  });
});
