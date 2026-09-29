import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { audioWaveform, videoStoryboard } from "../src/media-variants";
import { mediaCommand } from "../src/video-media";

const roots: string[] = [];
afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("bounded media inspection derivatives", () => {
  it("extracts a four-frame contact sheet and an audio waveform", async () => {
    const root = await mkdtemp(join(tmpdir(), "aiwa-variants-"));
    roots.push(root);
    await mediaCommand(
      "ffmpeg",
      [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=s=320x180:d=2:r=24",
        "-c:v",
        "libx264",
        "-y",
        join(root, "clip.mp4"),
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
        "sine=frequency=440:duration=2",
        "-c:a",
        "libmp3lame",
        "-y",
        join(root, "voice.mp3"),
      ],
      20_000,
    );
    const storyboard = await videoStoryboard(root, "clip.mp4", 2000);
    const waveform = await audioWaveform(root, "voice.mp3");
    expect(storyboard.info).toMatchObject({
      width: 1280,
      height: 180,
      format: "webp",
    });
    expect(waveform.info).toMatchObject({
      width: 1200,
      height: 180,
      format: "webp",
    });
    expect((await sharp(storyboard.data).stats()).entropy).toBeGreaterThan(1);
    expect((await sharp(waveform.data).stats()).entropy).toBeGreaterThan(0);
  }, 60_000);
});
