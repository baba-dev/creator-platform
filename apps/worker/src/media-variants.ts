import { parseMediaEnv } from "@aiwa/config";
import { resolveLocalAssetPath } from "@aiwa/assets/storage";
import sharp from "sharp";
import { mediaCommand } from "./video-media";

/** Four small, evenly spaced frames for timeline navigation. */
export async function videoStoryboard(
  storageRoot: string,
  objectKey: string,
  durationMs: number,
) {
  const source = resolveLocalAssetPath(storageRoot, objectKey);
  const framesPerSecond = (4000 / Math.max(durationMs, 100)).toFixed(5);
  const frame = await mediaCommand(
    "ffmpeg",
    [
      "-nostdin",
      "-v",
      "error",
      "-i",
      source,
      "-vf",
      `fps=${framesPerSecond},scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2,tile=4x1:nb_frames=4`,
      "-frames:v",
      "1",
      "-f",
      "image2pipe",
      "-vcodec",
      "mjpeg",
      "pipe:1",
    ],
    parseMediaEnv().MEDIA_DERIVATIVE_TIMEOUT_MS,
  );
  if (!frame.length) throw new Error("Could not extract video frames.");
  return sharp(frame)
    .webp({ quality: 72, effort: 4 })
    .toBuffer({ resolveWithObject: true });
}

/** Decode audio server-side into a small static overview; no audio is sent to the grid. */
export async function audioWaveform(storageRoot: string, objectKey: string) {
  const source = resolveLocalAssetPath(storageRoot, objectKey);
  const frame = await mediaCommand(
    "ffmpeg",
    [
      "-nostdin",
      "-v",
      "error",
      "-i",
      source,
      "-filter_complex",
      "aformat=channel_layouts=mono,showwavespic=s=1200x180:colors=white",
      "-frames:v",
      "1",
      "-f",
      "image2pipe",
      "-vcodec",
      "png",
      "pipe:1",
    ],
    parseMediaEnv().MEDIA_DERIVATIVE_TIMEOUT_MS,
  );
  if (!frame.length) throw new Error("Could not extract audio waveform.");
  return sharp(frame)
    .webp({ quality: 82, effort: 4 })
    .toBuffer({ resolveWithObject: true });
}
