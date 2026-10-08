import { describe, expect, it } from "vitest";
import {
  mediaToolSourceRoles,
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
