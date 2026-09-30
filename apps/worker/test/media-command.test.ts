import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mediaCommand } from "../src/video-media";
import { boundedMediaArgs } from "../src/media-policy";

describe("bounded media subprocesses", () => {
  it("scopes thread limits to every decoder, filters and the output encoder", () => {
    expect(
      boundedMediaArgs(
        "ffmpeg",
        ["-i", "first.mp4", "-i", "second.mp4", "-c:v", "libx264", "out.mp4"],
        1,
      ),
    ).toEqual([
      "-filter_threads",
      "1",
      "-filter_complex_threads",
      "1",
      "-threads",
      "1",
      "-i",
      "first.mp4",
      "-threads",
      "1",
      "-i",
      "second.mp4",
      "-c:v",
      "libx264",
      "-threads",
      "1",
      "out.mp4",
    ]);
  });

  it("kills a timed-out subprocess before releasing capacity", async () => {
    const root = await mkdtemp(join(tmpdir(), "aiwa-timeout-"));
    try {
      const path = join(root, "pid");
      await expect(
        mediaCommand(
          process.execPath,
          [
            "-e",
            "require('node:fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 20)",
            path,
          ],
          1000,
        ),
      ).rejects.toThrow("MEDIA_TIMEOUT");
      const pid = Number(await readFile(path, "utf8"));
      expect(() => process.kill(pid, 0)).toThrow();
      expect(
        (
          await mediaCommand(
            process.execPath,
            ["-e", "process.stdout.write('recovered')"],
            1000,
          )
        ).toString(),
      ).toBe("recovered");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("bounds output and does not expose raw subprocess diagnostics", async () => {
    await expect(
      mediaCommand(
        process.execPath,
        [
          "-e",
          "process.stdout.write(Buffer.alloc(1100000)); setInterval(() => {}, 20)",
        ],
        2000,
      ),
    ).rejects.toThrow("MEDIA_OUTPUT_LIMIT");
    await expect(
      mediaCommand(
        process.execPath,
        ["-e", "process.stderr.write('private-media-url'); process.exit(1)"],
        1000,
      ),
    ).rejects.toThrow("MEDIA_EXIT (1)");
  });
});
