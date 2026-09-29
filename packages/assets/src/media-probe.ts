import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
export async function probeUploadedMedia(
  path: string,
  kind: "VIDEO" | "AUDIO",
) {
  const { stdout } = await run(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=codec_type,codec_name,width,height",
      "-of",
      "json",
      path,
    ],
    { timeout: 15_000, maxBuffer: 100_000 },
  );
  const data = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: {
      codec_type: string;
      codec_name?: string;
      width?: number;
      height?: number;
    }[];
  };
  const durationMs = Math.round(Number(data.format?.duration) * 1000);
  if (!Number.isFinite(durationMs) || durationMs < 100 || durationMs > 120_000)
    throw new Error("Video or audio must be between 0.1 and 120 seconds.");
  const video = data.streams?.find((stream) => stream.codec_type === "video");
  const audio = data.streams?.find((stream) => stream.codec_type === "audio");
  if (
    kind === "VIDEO" &&
    (!video ||
      !video.width ||
      !video.height ||
      video.width > 3840 ||
      video.height > 2160 ||
      !["h264", "hevc", "av1"].includes(video.codec_name ?? ""))
  )
    throw new Error("Unsupported video codec or dimensions.");
  if (kind === "AUDIO" && !audio) throw new Error("Audio track is missing.");
  if (
    audio &&
    !["aac", "mp3", "pcm_s16le", "opus"].includes(audio.codec_name ?? "")
  )
    throw new Error("Unsupported audio codec.");
  return {
    durationMs,
    width: video?.width ?? null,
    height: video?.height ?? null,
  };
}
