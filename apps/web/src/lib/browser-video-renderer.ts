import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
} from "mediabunny";
import {
  resolveVideoClipTransform,
  videoOutputDimensions,
  type VideoEditDocument,
} from "@aiwa/assets/video-edit";
import { videoCropPixels } from "@/lib/media-export-policy";

const MAX_BROWSER_VIDEO_OUTPUT_BYTES = 100_000_000;

export async function renderSimpleVideoInBrowser({
  source,
  document,
  onProgress,
}: {
  source: Blob;
  document: VideoEditDocument;
  onProgress?: (progress: number) => void;
}) {
  const clip = document.clips[0];
  if (!clip || document.clips.length !== 1)
    throw new Error("Browser rendering requires one video clip.");

  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(source),
  });
  const videoTrack = await input.getPrimaryVideoTrack();
  if (!videoTrack)
    throw new Error("The source does not contain a video track.");

  const sourceWidth = await videoTrack.getDisplayWidth();
  const sourceHeight = await videoTrack.getDisplayHeight();
  const transform = resolveVideoClipTransform(clip.transform);
  const crop = videoCropPixels(document, sourceWidth, sourceHeight);
  const [width, height] = videoOutputDimensions(
    document.ratio,
    document.resolution,
  );

  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });
  const conversion = await Conversion.init({
    input,
    output,
    tracks: "primary",
    trim: {
      start: clip.inMs / 1000,
      end: clip.outMs / 1000,
    },
    video: {
      codec: "avc",
      width,
      height,
      fit: "contain",
      rotate: transform.rotation,
      flip: transform.flipX,
      allowTransformationMetadata: false,
      crop,
      frameRate: 24,
      quality: new Quality("medium"),
      hardwareAcceleration: "prefer-hardware",
      forceTranscode: true,
    },
    audio: clip.muted
      ? { discard: true }
      : {
          codec: "aac",
          quality: new Quality("medium"),
        },
    tags: {},
    showWarnings: false,
  });

  if (!conversion.isValid)
    throw new Error(
      "This browser cannot encode the selected video. The compatibility renderer will be used.",
    );

  conversion.onProgress = (progress) => {
    if (Number.isFinite(progress))
      onProgress?.(Math.max(0, Math.min(1, progress)));
  };
  await conversion.execute();

  const buffer = target.buffer;
  if (!buffer) throw new Error("Browser video encoding produced no output.");
  if (buffer.byteLength > MAX_BROWSER_VIDEO_OUTPUT_BYTES)
    throw new Error("Rendered video exceeds the 100 MB browser output limit.");
  return new Blob([buffer], { type: "video/mp4" });
}
