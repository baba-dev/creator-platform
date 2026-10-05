import {
  resolveVideoClipTransform,
  type VideoEditDocument,
} from "@aiwa/assets/video-edit";

export const MAX_BROWSER_VIDEO_SOURCE_BYTES = 80_000_000;

export type BrowserVideoAsset = {
  id: string;
  mediaKind: "VIDEO" | "AUDIO";
  durationMs: number | null;
  width: number | null;
  height: number | null;
  byteSize?: string;
};

export function browserVideoExportBlockReason(
  document: VideoEditDocument,
  source: BrowserVideoAsset | undefined,
): string | null {
  if (document.clips.length !== 1) return "multi-clip timeline";
  if (!source || source.mediaKind !== "VIDEO")
    return "source video unavailable";
  if (!source.width || !source.height || !source.durationMs)
    return "source metadata unavailable";
  if (document.voiceover || document.soundtrack)
    return "mixed audio tracks require the compatibility renderer";
  if (document.burnCaptions && document.captions.length)
    return "burned captions require the compatibility renderer";
  const clip = document.clips[0]!;
  if (clip.transition !== "cut")
    return "clip transitions require the compatibility renderer";
  if (clip.outMs > source.durationMs)
    return "trim range exceeds the source video";
  if (
    source.byteSize &&
    Number.isSafeInteger(Number(source.byteSize)) &&
    Number(source.byteSize) > MAX_BROWSER_VIDEO_SOURCE_BYTES
  )
    return "source is too large for safe in-browser rendering";
  return null;
}

export function canUseBrowserVideoRenderer() {
  if (typeof window === "undefined") return false;
  return ["VideoEncoder", "VideoDecoder", "AudioEncoder", "AudioDecoder"].every(
    (name) => name in globalThis,
  );
}

export function videoCropPixels(
  document: VideoEditDocument,
  sourceWidth: number,
  sourceHeight: number,
) {
  const clip = document.clips[0];
  if (!clip) throw new Error("A video clip is required.");
  const transform = resolveVideoClipTransform(clip.transform);
  const rotatedWidth =
    transform.rotation === 90 || transform.rotation === 270
      ? sourceHeight
      : sourceWidth;
  const rotatedHeight =
    transform.rotation === 90 || transform.rotation === 270
      ? sourceWidth
      : sourceHeight;
  const left = Math.round(transform.crop.x * rotatedWidth);
  const top = Math.round(transform.crop.y * rotatedHeight);
  const width = Math.max(1, Math.round(transform.crop.width * rotatedWidth));
  const height = Math.max(1, Math.round(transform.crop.height * rotatedHeight));
  return {
    left: Math.min(Math.max(0, left), Math.max(0, rotatedWidth - 1)),
    top: Math.min(Math.max(0, top), Math.max(0, rotatedHeight - 1)),
    width: Math.min(width, rotatedWidth - left),
    height: Math.min(height, rotatedHeight - top),
  };
}
