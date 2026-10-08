import { describe, expect, it } from "vitest";
import {
  mediaToolSourceRoles,
  mediaToolImageInputFits,
  parseMediaToolInput,
  scrollingDurationCeiling,
} from "../src/media-tool-input";

describe("MediaKit semantic inputs", () => {
  it.each([
    ["compress-image", {}],
    ["crop-image", { crop_width: 100, crop_height: 100 }],
    ["mosaic-image", {}],
    ["add-image-watermark", { watermark_text: "Aiwa" }],
    ["matte-portrait-video", {}],
    ["matte-greenscreen-video", {}],
    ["text-to-scrolling-video", { text: "Hello" }],
  ])("rejects provider URL and callback overrides for %s", (key, input) => {
    for (const field of [
      "image_url",
      "video_url",
      "callback_url",
      "client_token",
    ])
      expect(() =>
        parseMediaToolInput(key, { ...input, [field]: "https://example.com" }),
      ).toThrow();
  });

  it("requires both private source roles for lip sync", () => {
    expect(mediaToolSourceRoles("lip-sync")).toEqual([
      "SOURCE_VIDEO",
      "SOURCE_AUDIO",
    ]);
    expect(mediaToolSourceRoles("text-to-scrolling-video")).toEqual([
      "SOURCE_IMAGE",
    ]);
  });

  it("bounds scrolling reservations using Unicode code points and holds", () => {
    const input = parseMediaToolInput("text-to-scrolling-video", {
      text: "Hi😀",
      single_roll_duration: 0.5,
    });
    expect(scrollingDurationCeiling(input)).toBe(7);
    expect(() =>
      parseMediaToolInput("text-to-scrolling-video", {
        text: "x".repeat(2001),
      }),
    ).toThrow();
  });

  it("rejects background colours on transparent matting output", () => {
    expect(() =>
      parseMediaToolInput("matte-greenscreen-video", {
        format: "WEBM",
        background_color: "green",
      }),
    ).toThrow();
  });
});

describe("visual crop and watermark inputs", () => {
  const custom = {
    crop_mode: "custom",
    custom_x1: 10,
    custom_y1: 20,
    custom_x2: 100,
    custom_y2: 200,
  };
  it("requires a positive crop inside canonical dimensions", () => {
    const input = parseMediaToolInput("crop-image", custom);
    expect(mediaToolImageInputFits(input, 100, 200)).toBe(true);
    expect(mediaToolImageInputFits(input, 99, 200)).toBe(false);
    expect(mediaToolImageInputFits(input, null, null)).toBe(false);
    expect(() =>
      parseMediaToolInput("crop-image", { ...custom, custom_x2: 10 }),
    ).toThrow();
    expect(() =>
      parseMediaToolInput("crop-image", { ...custom, custom_y1: -1 }),
    ).toThrow();
  });
  it("uses a separate canonical logo role and rejects URL overrides", () => {
    const input = parseMediaToolInput("add-image-watermark", {
      watermark_type: "image",
      watermark_position: "top_center",
      watermark_image_opacity: 75,
    });
    expect(mediaToolSourceRoles("add-image-watermark", input)).toEqual([
      "SOURCE_IMAGE",
      "WATERMARK_IMAGE",
    ]);
    expect(() =>
      parseMediaToolInput("add-image-watermark", {
        ...input,
        watermark_image_url: "https://example.com/logo",
      }),
    ).toThrow();
    expect(() =>
      parseMediaToolInput("add-image-watermark", {
        watermark_text: "x".repeat(65),
      }),
    ).toThrow();
    expect(
      parseMediaToolInput("add-image-watermark", {
        watermark_text: "Brand",
        watermark_position: "right_center",
      }).watermark_position,
    ).toBe("right_center");
  });
});
