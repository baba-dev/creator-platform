import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { mediaCommand, probeMedia, renderVideo } from "../src/video-media";

const roots: string[] = [];
afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("video render", () => {
  it("trims and combines clips with an audio track into a playable mp4", async () => {
    const root = await mkdtemp(join(tmpdir(), "aiwa-render-test-"));
    roots.push(root);
    const video = join(root, "input.mp4");
    const audio = join(root, "voice.mp3");
    await mediaCommand(
      "ffmpeg",
      [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=320x180:d=2:r=24",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=500:duration=2",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-shortest",
        "-y",
        video,
      ],
      20_000,
    );
    await mediaCommand(
      "ffmpeg",
      [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=600:duration=2",
        "-c:a",
        "libmp3lame",
        "-y",
        audio,
      ],
      20_000,
    );
    const result = await renderVideo(
      {
        version: 1,
        ratio: "16:9",
        resolution: "720p",
        clips: [
          {
            id: crypto.randomUUID(),
            assetId: "video",
            inMs: 200,
            outMs: 900,
            muted: false,
            transition: "cut",
            transform: {
              crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
              rotation: 90,
              flipX: true,
            },
          },
          {
            id: crypto.randomUUID(),
            assetId: "video",
            inMs: 1000,
            outMs: 1700,
            muted: true,
            transition: "fade",
          },
        ],
        voiceover: {
          assetId: "audio",
          startMs: 0,
          inMs: 0,
          outMs: 1200,
          volume: 0.7,
          fadeInMs: 100,
          fadeOutMs: 100,
        },
        soundtrack: null,
        captions: [
          {
            id: crypto.randomUUID(),
            startMs: 100,
            endMs: 800,
            text: "مرحبا · नमस्ते · سلام",
            language: "ar",
          },
        ],
        burnCaptions: true,
      },
      new Map([
        ["video", video],
        ["audio", audio],
      ]),
    );
    expect(result.bytes.subarray(4, 8).toString()).toBe("ftyp");
    expect(result.width).toBe(1280);
    expect(result.height).toBe(720);
    expect(result.durationMs).toBeGreaterThanOrEqual(1350);
    expect(result.durationMs).toBeLessThanOrEqual(1500);
    expect((await probeMedia(video)).hasVideo).toBe(true);
  }, 60_000);
});
