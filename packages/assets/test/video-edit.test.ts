import { describe, expect, it } from "vitest";
import {
  resolveVideoClipTransform,
  videoEditAssetIds,
  videoEditDocumentSchema,
  videoOutputDimensions,
} from "../src/video-edit";

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

  it("keeps legacy v1 clips valid and resolves an identity transform", () => {
    const edit = videoEditDocumentSchema.parse({
      version: 1,
      ratio: "16:9",
      resolution: "720p",
      clips: [clip],
    });
    expect(edit.clips[0]?.transform).toBeUndefined();
    expect(resolveVideoClipTransform(edit.clips[0]?.transform)).toEqual({
      crop: { x: 0, y: 0, width: 1, height: 1 },
      rotation: 0,
      flipX: false,
    });
  });

  it("accepts bounded crop, rotation, and horizontal flip metadata", () => {
    const edit = videoEditDocumentSchema.parse({
      version: 1,
      ratio: "9:16",
      resolution: "1080p",
      clips: [
        {
          ...clip,
          transform: {
            crop: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 },
            rotation: 90,
            flipX: true,
          },
        },
      ],
    });
    expect(edit.clips[0]?.transform?.rotation).toBe(90);
    expect(videoOutputDimensions(edit.ratio, edit.resolution)).toEqual([
      1080, 1920,
    ]);
  });

  it("rejects a crop that leaves the source bounds", () => {
    const result = videoEditDocumentSchema.safeParse({
      version: 1,
      ratio: "16:9",
      resolution: "720p",
      clips: [
        {
          ...clip,
          transform: {
            crop: { x: 0.6, y: 0, width: 0.5, height: 1 },
            rotation: 0,
            flipX: false,
          },
        },
      ],
    });
    expect(result.success).toBe(false);
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
