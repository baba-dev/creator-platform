import { describe, expect, it } from "vitest";
import { videoEditDocumentSchema, videoEditAssetIds } from "../src/video-edit";

const clip = {
  id: crypto.randomUUID(),
  assetId: "video",
  inMs: 0,
  outMs: 2000,
  muted: false,
  transition: "cut" as const,
};
describe("video edit document", () => {
  it("accepts a bounded source-linked edit with audio and captions", () => {
    const edit = videoEditDocumentSchema.parse({
      version: 1,
      ratio: "9:16",
      resolution: "720p",
      clips: [clip],
      voiceover: {
        assetId: "voice",
        startMs: 0,
        inMs: 0,
        outMs: 1800,
        volume: 1,
        fadeInMs: 0,
        fadeOutMs: 100,
      },
      soundtrack: null,
      captions: [
        {
          id: crypto.randomUUID(),
          startMs: 0,
          endMs: 1000,
          text: "नमस्ते",
          language: "hi",
        },
      ],
      burnCaptions: true,
    });
    expect(videoEditAssetIds(edit)).toEqual(["video", "voice"]);
  });

  it("accepts bounded non-destructive crop, rotation, and flip transforms", () => {
    const parsed = videoEditDocumentSchema.parse({
      version: 1,
      ratio: "9:16",
      resolution: "1080p",
      clips: [
        {
          ...clip,
          transform: {
            crop: { x: 0.1, y: 0.05, width: 0.8, height: 0.9 },
            rotation: 90,
            flipX: true,
          },
        },
      ],
    });
    expect(parsed.clips[0]?.transform).toEqual({
      crop: { x: 0.1, y: 0.05, width: 0.8, height: 0.9 },
      rotation: 90,
      flipX: true,
    });

    expect(
      videoEditDocumentSchema.safeParse({
        version: 1,
        ratio: "16:9",
        resolution: "720p",
        clips: [
          {
            ...clip,
            transform: {
              crop: { x: 0.4, y: 0, width: 0.7, height: 1 },
              rotation: 0,
              flipX: false,
            },
          },
        ],
      }).success,
    ).toBe(false);
  });
  it("rejects invalid cut, caption, and excessive duration", () => {
    const base = {
      version: 1,
      ratio: "16:9",
      resolution: "720p",
      clips: [clip],
    };
    expect(
      videoEditDocumentSchema.safeParse({
        ...base,
        clips: [{ ...clip, outMs: 0 }],
      }).success,
    ).toBe(false);
    expect(
      videoEditDocumentSchema.safeParse({
        ...base,
        captions: [
          {
            id: crypto.randomUUID(),
            startMs: 1800,
            endMs: 3000,
            text: "late",
            language: "en",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      videoEditDocumentSchema.safeParse({
        ...base,
        clips: [{ ...clip, outMs: 120_001 }],
      }).success,
    ).toBe(false);
  });
});
