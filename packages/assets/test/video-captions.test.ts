import { describe, expect, it } from "vitest";
import { formatVideoCaptions } from "../src/video-captions";

const document = {
  version: 1,
  ratio: "16:9",
  resolution: "720p",
  clips: [
    {
      id: "126791a9-cfaa-41a5-a0c2-5b8d8343e3d2",
      assetId: "source",
      inMs: 0,
      outMs: 6000,
      muted: false,
      transition: "cut",
    },
  ],
  voiceover: null,
  soundtrack: null,
  captions: [
    {
      id: "ab839686-9e72-433f-b96b-d56311d73fd9",
      startMs: 1234,
      endMs: 4000,
      text: "नमस्ते مرحبا",
      language: "hi",
    },
  ],
  burnCaptions: false,
};

describe("video caption export", () => {
  it("writes SRT and VTT with correct millisecond syntax and Unicode", () => {
    expect(formatVideoCaptions(document, "srt")).toBe(
      "1\n00:00:01,234 --> 00:00:04,000\nनमस्ते مرحبا\n",
    );
    expect(formatVideoCaptions(document, "vtt")).toBe(
      "WEBVTT\n\n1\n00:00:01.234 --> 00:00:04.000\nनमस्ते مرحبا\n",
    );
  });

  it("rejects cues extending beyond the source timeline", () => {
    expect(() =>
      formatVideoCaptions(
        {
          ...document,
          captions: [{ ...document.captions[0], endMs: 7000 }],
        },
        "vtt",
      ),
    ).toThrow();
  });
});
