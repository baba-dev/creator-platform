import { describe, expect, it } from "vitest";
import type { VideoEditDocument } from "@aiwa/assets/video-edit";
import {
  clientVideoFallbackReason,
  normalizedCropToPixels,
  videoOutputDimensions,
} from "./client-video-render";

const baseDocument: VideoEditDocument = {
  version: 1,
  ratio: "9:16",
  resolution: "720p",
  clips: [
    {
      id: crypto.randomUUID(),
      assetId: "video-1",
      inMs: 500,
      outMs: 2500,
      muted: false,
      transition: "cut",
      transform: {
        crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        rotation: 90,
        flipX: false,
      },
    },
  ],
  voiceover: null,
  soundtrack: null,
  captions: [],
  burnCaptions: false,
};

const source = {
  id: "video-1",
  width: 1920,
  height: 1080,
  durationMs: 5000,
  byteSize: "5000000",
};

describe("client video renderer planning", () => {
  it("keeps simple single-clip edits on the browser path", () => {
    expect(
      clientVideoFallbackReason(baseDocument, source, {
        videoDecoder: true,
        videoEncoder: true,
      }),
    ).toBeNull();
    expect(videoOutputDimensions("9:16", "720p")).toEqual([720, 1280]);
  });

  it("routes complex and unsupported edits to the existing server renderer", () => {
    expect(
      clientVideoFallbackReason(
        {
          ...baseDocument,
          voiceover: {
            assetId: "voice",
            startMs: 0,
            inMs: 0,
            outMs: 1000,
            volume: 1,
            fadeInMs: 0,
            fadeOutMs: 0,
          },
        },
        source,
        { videoDecoder: true, videoEncoder: true },
      ),
    ).toMatch(/mixed audio/i);

    expect(
      clientVideoFallbackReason(baseDocument, source, {
        videoDecoder: false,
        videoEncoder: true,
      }),
    ).toMatch(/WebCodecs/i);
  });

  it("clamps normalized crop rectangles to source pixels", () => {
    expect(
      normalizedCropToPixels(
        { x: 0.25, y: 0.1, width: 0.5, height: 0.8 },
        1080,
        1920,
      ),
    ).toEqual({
      left: 270,
      top: 192,
      width: 540,
      height: 1536,
    });
  });
});
