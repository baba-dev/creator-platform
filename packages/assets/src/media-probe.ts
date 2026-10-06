import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export class MediaProbeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaProbeValidationError";
  }
}

export interface ProbedMediaMetadata {
  durationMs: number | null;
  width: number | null;
  height: number | null;
}

export async function probeUploadedMedia(
  path: string,
  kind: "VIDEO" | "AUDIO",
): Promise<ProbedMediaMetadata> {
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
  let data: {
    format?: { duration?: string };
    streams?: {
      codec_type: string;
      codec_name?: string;
      width?: number;
      height?: number;
    }[];
  };
  try {
    data = JSON.parse(stdout) as typeof data;
  } catch {
    throw new MediaProbeValidationError("Media metadata is malformed.");
  }
  /* c8 ignore start -- shape documented by ffprobe JSON */
  data = data as {
    format?: { duration?: string };
    streams?: {
      codec_type: string;
      codec_name?: string;
      width?: number;
      height?: number;
    }[];
  };
  /* c8 ignore stop */
  const durationMs = Math.round(Number(data.format?.duration) * 1000);
  if (!Number.isFinite(durationMs) || durationMs < 100 || durationMs > 120_000)
    throw new MediaProbeValidationError(
      "Video or audio must be between 0.1 and 120 seconds.",
    );
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
    throw new MediaProbeValidationError(
      "Unsupported video codec or dimensions.",
    );
  if (kind === "AUDIO" && !audio)
    throw new MediaProbeValidationError("Audio track is missing.");
  if (
    audio &&
    !["aac", "mp3", "pcm_s16le", "opus"].includes(audio.codec_name ?? "")
  )
    throw new MediaProbeValidationError("Unsupported audio codec.");
  return {
    durationMs,
    width: video?.width ?? null,
    height: video?.height ?? null,
  };
}

export async function probeUploadedBuffer(
  bytes: Buffer,
  kind: "VIDEO" | "AUDIO",
  extension = kind === "VIDEO" ? "mp4" : "mp3",
): Promise<ProbedMediaMetadata> {
  const root = await mkdtemp(join(tmpdir(), "aiwa-probe-"));
  const tempPath = join(root, `probe.${extension}`);
  try {
    await writeFile(tempPath, bytes);
    return await probeUploadedMedia(tempPath, kind);
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function inspectAndProbeUploadedMedia(input: {
  path?: string;
  bytes?: Buffer;
  kind: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "OTHER";
  extension?: string;
  imageInspector?: (
    source: Buffer | string,
  ) => Promise<{ width: number | null; height: number | null }>;
}): Promise<ProbedMediaMetadata> {
  if (input.kind === "VIDEO" || input.kind === "AUDIO") {
    if (input.path) {
      return await probeUploadedMedia(input.path, input.kind);
    }
    if (input.bytes) {
      return await probeUploadedBuffer(
        input.bytes,
        input.kind,
        input.extension,
      );
    }
    throw new Error("Either path or bytes must be provided to probe media.");
  }
  if (input.kind === "IMAGE") {
    if (input.imageInspector) {
      const img = await input.imageInspector(input.bytes ?? input.path!);
      return { width: img.width, height: img.height, durationMs: null };
    }
    return { width: null, height: null, durationMs: null };
  }
  return { width: null, height: null, durationMs: null };
}
