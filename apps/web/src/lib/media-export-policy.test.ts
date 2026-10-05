import { describe, expect, it } from "vitest";
import type { VideoEditDocument } from "@aiwa/assets/video-edit";
import {
  browserVideoExportBlockReason,
  videoCropPixels,
  type BrowserVideoAsset,
} from "./media-export-policy";

const source: BrowserVideoAsset = {
  id: "video",
  mediaKind: "VIDEO",
  durationMs: 10_000,
  width: 1920,
  height: 1080,
  byteSize: "20000000",
};

const document: VideoEditDocument = {
  version: 1,
  ratio: "16:9",
  resolution: "720p",
  clips: [
    {
      id: crypto.randomUUID(),
      assetId: "video",
      inMs: 1000,
      outMs: 5000,
      muted: false,
      transition: "cut",
      transform: {
        crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
        rotation: 90,
        flipX: true,
      },
    },
  ],
  voiceover: null,
  soundtrack: null,
  captions: [],
  burnCaptions: false,
};

describe("browser video export policy", () => {
  it("admits a bounded simple single-clip project", () => {
    expect(browserVideoExportBlockReason(document, source)).toBeNull();
    expect(videoCropPixels(document, 1920, 1080)).toEqual({
      left: 108,
      top: 384,
      width: 540,
      height: 1152,
    });
  });

  it("routes complex timelines to the compatibility renderer", () => {
    expect(
      browserVideoExportBlockReason(
        { ...document, clips: [...document.clips, document.clips[0]!] },
        source,
      ),
    ).toBe("multi-clip timeline");
    expect(
      browserVideoExportBlockReason(
        {
          ...document,
          soundtrack: {
            assetId: "music",
            startMs: 0,
            inMs: 0,
            outMs: 1000,
            volume: 0.4,
            fadeInMs: 0,
            fadeOutMs: 0,
          },
        },
        source,
      ),
    ).toContain("mixed audio");
    expect(
      browserVideoExportBlockReason(
        {
          ...document,
          captions: [
            {
              id: crypto.randomUUID(),
              startMs: 0,
              endMs: 1000,
              text: "Caption",
              language: "en",
            },
          ],
          burnCaptions: true,
        },
        source,
      ),
    ).toContain("captions");
  });

  it("rejects oversized browser sources without invalidating the edit", () => {
    expect(
      browserVideoExportBlockReason(document, {
        ...source,
        byteSize: "90000000",
      }),
    ).toContain("too large");
  });
});
