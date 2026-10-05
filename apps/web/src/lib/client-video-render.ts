import type { VideoEditDocument } from "@aiwa/assets/video-edit";

export type ClientVideoSource = {
  id: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  byteSize?: string | null;
};

export type ClientVideoCapabilities = {
  videoDecoder: boolean;
  videoEncoder: boolean;
};

export type NormalizedCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const MAX_CLIENT_SOURCE_BYTES = 100_000_000;
const MAX_CLIENT_OUTPUT_BYTES = 95_000_000;

export function videoOutputDimensions(
  ratio: VideoEditDocument["ratio"],
  resolution: VideoEditDocument["resolution"],
): [number, number] {
  const dimensions: Record<VideoEditDocument["ratio"], [number, number]> = {
    "16:9": resolution === "1080p" ? [1920, 1080] : [1280, 720],
    "9:16": resolution === "1080p" ? [1080, 1920] : [720, 1280],
    "1:1": resolution === "1080p" ? [1080, 1080] : [720, 720],
    "4:3": resolution === "1080p" ? [1440, 1080] : [960, 720],
    "3:4": resolution === "1080p" ? [1080, 1440] : [720, 960],
  };
  return dimensions[ratio];
}

export function normalizedCropToPixels(
  crop: NormalizedCrop | undefined,
  width: number,
  height: number,
) {
  const value = crop ?? { x: 0, y: 0, width: 1, height: 1 };
  const left = Math.max(0, Math.min(width - 1, Math.round(value.x * width)));
  const top = Math.max(0, Math.min(height - 1, Math.round(value.y * height)));
  const cropWidth = Math.max(
    2,
    Math.min(width - left, Math.round(value.width * width)),
  );
  const cropHeight = Math.max(
    2,
    Math.min(height - top, Math.round(value.height * height)),
  );
  return {
    left,
    top,
    width: cropWidth,
    height: cropHeight,
  };
}

export function clientVideoFallbackReason(
  document: VideoEditDocument,
  source: ClientVideoSource | undefined,
  capabilities: ClientVideoCapabilities,
): string | null {
  if (!source) return "The selected video is not available.";
  if (document.clips.length !== 1)
    return "Multi-clip projects use the server renderer.";
  if (document.voiceover || document.soundtrack)
    return "Projects with mixed audio use the server renderer.";
  if (document.burnCaptions && document.captions.length)
    return "Burned captions use the server renderer.";
  if (!source.width || !source.height || !source.durationMs)
    return "Video metadata is incomplete.";
  if (
    source.byteSize &&
    Number.isFinite(Number(source.byteSize)) &&
    Number(source.byteSize) > MAX_CLIENT_SOURCE_BYTES
  )
    return "Large source files use the server renderer.";
  if (!capabilities.videoDecoder || !capabilities.videoEncoder)
    return "This browser does not expose WebCodecs video support.";
  return null;
}

export function browserVideoCapabilities(): ClientVideoCapabilities {
  return {
    videoDecoder: typeof globalThis.VideoDecoder !== "undefined",
    videoEncoder: typeof globalThis.VideoEncoder !== "undefined",
  };
}

export async function renderClientVideo(input: {
  document: VideoEditDocument;
  source: ClientVideoSource;
  sourceUrl: string;
  onProgress?: (progress: number) => void;
}): Promise<Blob> {
  const reason = clientVideoFallbackReason(
    input.document,
    input.source,
    browserVideoCapabilities(),
  );
  if (reason) throw new Error(reason);

  const clip = input.document.clips[0]!;
  const response = await fetch(input.sourceUrl, {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("Source video could not be loaded.");
  const sourceBlob = await response.blob();
  if (sourceBlob.size > MAX_CLIENT_SOURCE_BYTES)
    throw new Error("Large source files use the server renderer.");

  const {
    ALL_FORMATS,
    BlobSource,
    BufferTarget,
    Conversion,
    Input,
    Mp4OutputFormat,
    Output,
  } = await import("mediabunny");

  const mediaInput = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(sourceBlob, { maxCacheSize: 4 * 1024 * 1024 }),
  });
  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });

  const rotation = clip.transform?.rotation ?? 0;
  const rotatedWidth =
    rotation === 90 || rotation === 270
      ? input.source.height!
      : input.source.width!;
  const rotatedHeight =
    rotation === 90 || rotation === 270
      ? input.source.width!
      : input.source.height!;
  const crop = normalizedCropToPixels(
    clip.transform?.crop,
    rotatedWidth,
    rotatedHeight,
  );
  const [width, height] = videoOutputDimensions(
    input.document.ratio,
    input.document.resolution,
  );

  const conversion = await Conversion.init({
    input: mediaInput,
    output,
    tracks: "primary",
    trim: {
      start: clip.inMs / 1000,
      end: clip.outMs / 1000,
    },
    video: {
      width,
      height,
      fit: "contain",
      rotate: rotation,
      flip: clip.transform?.flipX ?? false,
      crop,
      hardwareAcceleration: "prefer-hardware",
    },
    audio: clip.muted ? { discard: true } : undefined,
  });

  if (!conversion.isValid) {
    throw new Error("This browser cannot encode the requested MP4 safely.");
  }
  conversion.onProgress = (progress) => input.onProgress?.(progress);
  await conversion.execute();

  const buffer = target.buffer;
  if (!buffer) throw new Error("Browser video export produced no output.");
  if (buffer.byteLength > MAX_CLIENT_OUTPUT_BYTES)
    throw new Error("Browser output is too large for the direct upload path.");
  return new Blob([buffer], { type: "video/mp4" });
}

export async function uploadClientVideo(input: {
  organizationId: string;
  blob: Blob;
  filename: string;
}) {
  const response = await fetch("/api/assets/media-upload", {
    method: "POST",
    headers: {
      "content-type": "video/mp4",
      "x-organization-id": input.organizationId,
      "x-file-name": input.filename,
    },
    body: input.blob,
  });
  const body = (await response.json()) as {
    asset?: { id: string };
    error?: string;
  };
  if (!response.ok || !body.asset?.id) {
    throw new Error(body.error ?? "Edited video could not be saved.");
  }
  return body.asset.id;
}
