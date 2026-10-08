import { describe, expect, it } from "vitest";
import {
  defaultSettings,
  fitCrop,
  mediaInput,
  presetCrop,
  previewUrl,
  resizeCrop,
  sourceKind,
  toolGroup,
  type MediaAsset,
} from "./mediakit-model";

describe("MediaKit visual controls", () => {
  it("keeps crop corners within the actual image and prevents inverted rectangles", () => {
    const crop = { x: 10, y: 20, width: 100, height: 80 };
    expect(resizeCrop(crop, "top_left", 200, 200, 640, 480)).toEqual({
      x: 109,
      y: 99,
      width: 1,
      height: 1,
    });
    expect(resizeCrop(crop, "bottom_right", 1000, 1000, 640, 480)).toEqual({
      x: 10,
      y: 20,
      width: 630,
      height: 460,
    });
    expect(
      fitCrop({ x: -20, y: 900, width: 999, height: 999 }, 640, 480),
    ).toEqual({ x: 0, y: 479, width: 640, height: 1 });
    expect(presetCrop(640, 480, 1)).toEqual({
      x: 80,
      y: 0,
      width: 480,
      height: 480,
    });
  });
  it("submits pixel coordinates and separates logo opacity from text settings", () => {
    expect(
      mediaInput("crop-image", defaultSettings, {
        x: 10,
        y: 20,
        width: 100,
        height: 80,
      }),
    ).toEqual({
      crop_mode: "custom",
      custom_x1: 10,
      custom_y1: 20,
      custom_x2: 110,
      custom_y2: 100,
      output_format: "png",
    });
    const logo = mediaInput(
      "add-image-watermark",
      { ...defaultSettings, watermarkType: "image", opacity: 75 },
      { x: 0, y: 0, width: 1, height: 1 },
    );
    expect(logo).toEqual({
      watermark_type: "image",
      watermark_position: "bottom_right",
      watermark_image_opacity: 75,
      output_format: "png",
    });
  });
  it("never substitutes originals in a grid or missing image preview", () => {
    const asset = {
      id: "image",
      mediaKind: "IMAGE",
      variants: [{ kind: "PREVIEW" }],
    } as MediaAsset;
    expect(previewUrl(asset, true)).toBeNull();
    expect(previewUrl(asset)).toBe("/api/assets/image/variant/preview");
    expect(previewUrl({ ...asset, variants: [] })).toBeNull();
  });
  it("groups all thirteen operations and preserves source type for scrolling", () => {
    expect(sourceKind("text-to-scrolling-video")).toBe("IMAGE");
    expect(toolGroup("text-to-scrolling-video")).toBe("Video finishing");
    expect(toolGroup("semantic-segment")).toBe("Analysis");
  });
});
