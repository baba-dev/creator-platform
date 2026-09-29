import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VideoEditDocument } from "@aiwa/assets/video-edit";

export async function mediaCommand(
  binary: string,
  args: string[],
  timeoutMs: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    const output: Buffer[] = [];
    let errorText = "";
    let outputSize = 0;
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      outputSize += chunk.length;
      if (outputSize > 1_000_000) child.kill("SIGKILL");
      else output.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      errorText = (errorText + chunk.toString("utf8")).slice(-4000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(output));
      else
        reject(
          new Error(`Media command failed (${code}): ${errorText.slice(-300)}`),
        );
    });
  });
}

export async function probeMedia(path: string) {
  const raw = await mediaCommand(
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
    15_000,
  );
  const data = JSON.parse(raw.toString("utf8")) as {
    format?: { duration?: string };
    streams?: {
      codec_type: string;
      codec_name?: string;
      width?: number;
      height?: number;
    }[];
  };
  const durationMs = Math.round(Number(data.format?.duration) * 1000);
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 120_000)
    throw new Error("Media duration must be between 0 and 120 seconds.");
  const video = data.streams?.find((stream) => stream.codec_type === "video");
  const audio = data.streams?.find((stream) => stream.codec_type === "audio");
  if (
    video &&
    (!video.width ||
      !video.height ||
      video.width > 3840 ||
      video.height > 2160 ||
      !["h264", "hevc", "av1"].includes(video.codec_name ?? ""))
  )
    throw new Error("Unsupported video codec or dimensions.");
  if (
    audio &&
    !["aac", "mp3", "pcm_s16le", "opus"].includes(audio.codec_name ?? "")
  )
    throw new Error("Unsupported audio codec.");
  return {
    durationMs,
    width: video?.width ?? null,
    height: video?.height ?? null,
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
  };
}

function srtTime(ms: number) {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor(ms / 60_000) % 60;
  const seconds = Math.floor(ms / 1000) % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}

/** Input paths are resolved from persisted asset keys, never user filenames. */
export async function renderVideo(
  document: VideoEditDocument,
  paths: Map<string, string>,
): Promise<{
  bytes: Buffer;
  durationMs: number;
  width: number;
  height: number;
}> {
  const work = await mkdtemp(join(tmpdir(), "aiwa-video-"));
  try {
    const ids = [...paths.keys()];
    const media = await Promise.all(
      ids.map((id) => probeMedia(paths.get(id)!)),
    );
    const dimensions: Record<VideoEditDocument["ratio"], [number, number]> = {
      "16:9": document.resolution === "1080p" ? [1920, 1080] : [1280, 720],
      "9:16": document.resolution === "1080p" ? [1080, 1920] : [720, 1280],
      "1:1": document.resolution === "1080p" ? [1080, 1080] : [720, 720],
      "4:3": document.resolution === "1080p" ? [1440, 1080] : [960, 720],
      "3:4": document.resolution === "1080p" ? [1080, 1440] : [720, 960],
    };
    const [width, height] = dimensions[document.ratio];
    const args = ids.flatMap((id) => ["-i", paths.get(id)!]);
    const filters: string[] = [];
    const segments: string[] = [];
    document.clips.forEach((clip, index) => {
      const input = ids.indexOf(clip.assetId);
      const detail = media[input]!;
      if (!detail.hasVideo || clip.outMs > detail.durationMs)
        throw new Error("Video clip exceeds its source.");
      const duration = (clip.outMs - clip.inMs) / 1000;
      const begin = clip.inMs / 1000;
      const fade =
        clip.transition === "fade" && index > 0
          ? `,fade=t=in:st=0:d=${Math.min(0.25, duration / 3)}`
          : "";
      filters.push(
        `[${input}:v]trim=start=${begin}:duration=${duration},setpts=PTS-STARTPTS,fps=24,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1${fade}[v${index}]`,
      );
      if (detail.hasAudio && !clip.muted)
        filters.push(
          `[${input}:a]atrim=start=${begin}:duration=${duration},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur=${duration},atrim=duration=${duration}[a${index}]`,
        );
      else
        filters.push(
          `anullsrc=r=48000:cl=stereo,atrim=duration=${duration}[a${index}]`,
        );
      segments.push(`[v${index}][a${index}]`);
    });
    filters.push(
      `${segments.join("")}concat=n=${segments.length}:v=1:a=1[basev][basea]`,
    );
    let audioLabel = "basea";
    for (const [name, track] of [
      ["voice", document.voiceover],
      ["music", document.soundtrack],
    ] as const) {
      if (!track) continue;
      const input = ids.indexOf(track.assetId);
      const detail = media[input]!;
      if (!detail.hasAudio || track.outMs > detail.durationMs)
        throw new Error("Audio track exceeds its source.");
      const duration = (track.outMs - track.inMs) / 1000;
      const envelope = [
        track.fadeInMs
          ? `afade=t=in:st=0:d=${Math.min(track.fadeInMs / 1000, duration)}`
          : "",
        track.fadeOutMs
          ? `afade=t=out:st=${Math.max(0, duration - track.fadeOutMs / 1000)}:d=${Math.min(track.fadeOutMs / 1000, duration)}`
          : "",
      ]
        .filter(Boolean)
        .join(",");
      filters.push(
        `[${input}:a]atrim=start=${track.inMs / 1000}:duration=${duration},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume=${track.volume}${envelope ? "," + envelope : ""},adelay=${track.startMs}|${track.startMs}[mix${name}]`,
      );
      filters.push(
        `[${audioLabel}][mix${name}]amix=inputs=2:duration=first:normalize=0[audio${name}]`,
      );
      audioLabel = `audio${name}`;
    }
    let videoLabel = "basev";
    if (document.burnCaptions && document.captions.length) {
      const subtitle = document.captions
        .map(
          (item, index) =>
            `${index + 1}\n${srtTime(item.startMs)} --> ${srtTime(item.endMs)}\n${item.text.replace(/[\r\n]+/g, " ")}\n`,
        )
        .join("\n");
      await writeFile(join(work, "captions.srt"), subtitle);
      // Restrict temporary paths to generated ASCII names; libass handles multilingual glyphs.
      filters.push(`[basev]subtitles=${join(work, "captions.srt")}[captioned]`);
      videoLabel = "captioned";
    }
    const output = join(work, "output.mp4");
    await mediaCommand(
      "ffmpeg",
      [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        ...args,
        "-filter_complex",
        filters.join(";"),
        "-map",
        `[${videoLabel}]`,
        "-map",
        `[${audioLabel}]`,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        "-t",
        String(
          document.clips.reduce(
            (sum, clip) => sum + clip.outMs - clip.inMs,
            0,
          ) / 1000,
        ),
        "-y",
        output,
      ],
      300_000,
    );
    const bytes = await readFile(output);
    if (bytes.length > 300_000_000)
      throw new Error("Rendered video exceeds 300 MB.");
    const info = await probeMedia(output);
    return { bytes, width, height, durationMs: info.durationMs };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
