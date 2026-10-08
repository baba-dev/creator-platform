export type MediaTool = {
  key: string;
  name: string;
  description: string;
  category: string;
  available: boolean;
};
export type MediaAsset = {
  id: string;
  name: string;
  mediaKind: string;
  mimeType: string;
  byteSize: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  variants: { kind: string }[];
};
export type MediaExecution = {
  id: string;
  status: string;
  tool?: string;
  displayName?: string;
  createdAt?: string;
  providerTool?: { displayName: string; providerToolId: string };
  outputAssetId?: string | null;
  outputMimeType?: string | null;
  sourceAsset?: MediaAsset | null;
  outputAsset?: MediaAsset | null;
  reservedCredits?: string;
  chargedCredits?: string;
  errorMessage?: string | null;
  vqScore?: number | null;
  segments?: { index: number; start_ms: number; end_ms: number }[] | null;
};
export type Crop = { x: number; y: number; width: number; height: number };
export type Settings = {
  quality: number;
  pixelSize: number;
  format: string;
  background: string;
  watermarkType: string;
  text: string;
  position: string;
  opacity: number;
  fontSize: number;
  color: string;
  resolution: string;
  font: string;
  seconds: number;
  alignSourceFps: boolean;
};
export const defaultSettings: Settings = {
  quality: 80,
  pixelSize: 16,
  format: "WEBM",
  background: "green",
  watermarkType: "text",
  text: "",
  position: "bottom_right",
  opacity: 50,
  fontSize: 24,
  color: "#FFFFFF",
  resolution: "720p",
  font: "inter",
  seconds: 3,
  alignSourceFps: true,
};
export const activeStatuses = ["QUEUED", "SUBMITTING", "PROCESSING"];
export const positions = [
  "top_left",
  "top_center",
  "top_right",
  "left_center",
  "center",
  "right_center",
  "bottom_left",
  "bottom_center",
  "bottom_right",
];
export function sourceKind(key: string) {
  return key.endsWith("image") || key === "text-to-scrolling-video"
    ? "IMAGE"
    : "VIDEO";
}
export function toolGroup(key: string) {
  return ["assess-video-quality", "semantic-segment"].includes(key)
    ? "Analysis"
    : sourceKind(key) === "IMAGE" && key !== "text-to-scrolling-video"
      ? "Image"
      : "Video finishing";
}
export function previewUrl(asset: MediaAsset, grid = false) {
  const kind =
    asset.mediaKind === "IMAGE"
      ? grid
        ? "THUMBNAIL"
        : "PREVIEW"
      : asset.mediaKind === "VIDEO"
        ? "POSTER"
        : "WAVEFORM";
  return asset.variants.some((v) => v.kind === kind)
    ? `/api/assets/${encodeURIComponent(asset.id)}/variant/${kind.toLowerCase()}`
    : null;
}
export function originalUrl(asset: MediaAsset) {
  return `/api/assets/${encodeURIComponent(asset.id)}`;
}
export function byteLabel(value: string) {
  const bytes = Number(value);
  return Number.isFinite(bytes)
    ? bytes >= 1048576
      ? `${(bytes / 1048576).toFixed(1)} MiB`
      : `${(bytes / 1024).toFixed(1)} KiB`
    : "Size unavailable";
}
export function timeLabel(ms: number) {
  const secs = Math.floor(ms / 1000);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}
export function assetDetail(asset: MediaAsset) {
  return [
    asset.width && asset.height ? `${asset.width} × ${asset.height}` : null,
    asset.durationMs ? timeLabel(asset.durationMs) : null,
    byteLabel(asset.byteSize),
  ]
    .filter(Boolean)
    .join(" · ");
}
export function fitCrop(crop: Crop, width: number, height: number): Crop {
  const x = Math.max(0, Math.min(width - 1, Math.round(crop.x)));
  const y = Math.max(0, Math.min(height - 1, Math.round(crop.y)));
  return {
    x,
    y,
    width: Math.max(1, Math.min(width - x, Math.round(crop.width))),
    height: Math.max(1, Math.min(height - y, Math.round(crop.height))),
  };
}
export function presetCrop(
  width: number,
  height: number,
  ratio: number | null,
): Crop {
  const w = ratio ? Math.min(width, height * ratio) : width;
  const h = ratio ? w / ratio : height;
  return fitCrop(
    { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h },
    width,
    height,
  );
}
export function resizeCrop(
  crop: Crop,
  corner: string,
  dx: number,
  dy: number,
  width: number,
  height: number,
): Crop {
  const x1 = corner.includes("left")
    ? Math.max(0, Math.min(crop.x + crop.width - 1, crop.x + dx))
    : crop.x;
  const y1 = corner.includes("top")
    ? Math.max(0, Math.min(crop.y + crop.height - 1, crop.y + dy))
    : crop.y;
  const x2 = corner.includes("right")
    ? Math.min(width, Math.max(crop.x + 1, crop.x + crop.width + dx))
    : crop.x + crop.width;
  const y2 = corner.includes("bottom")
    ? Math.min(height, Math.max(crop.y + 1, crop.y + crop.height + dy))
    : crop.y + crop.height;
  return fitCrop(
    { x: x1, y: y1, width: x2 - x1, height: y2 - y1 },
    width,
    height,
  );
}
export function mediaInput(
  key: string,
  s: Settings,
  crop: Crop,
): Record<string, unknown> {
  if (key.startsWith("matte-"))
    return s.format === "MP4"
      ? { format: "MP4", background_color: s.background }
      : { format: "WEBM" };
  if (key === "compress-image")
    return { quality: s.quality, output_format: "jpeg" };
  if (key === "crop-image")
    return {
      crop_mode: "custom",
      custom_x1: crop.x,
      custom_y1: crop.y,
      custom_x2: crop.x + crop.width,
      custom_y2: crop.y + crop.height,
      output_format: "png",
    };
  if (key === "mosaic-image")
    return {
      mosaic_type: "full-image",
      mosaic_shape: "rectangle",
      mosaic_step_x: s.pixelSize,
      mosaic_step_y: s.pixelSize,
      output_format: "png",
    };
  if (key === "add-image-watermark")
    return s.watermarkType === "image"
      ? {
          watermark_type: "image",
          watermark_position: s.position,
          watermark_image_opacity: s.opacity,
          output_format: "png",
        }
      : {
          watermark_type: "text",
          watermark_text: s.text,
          watermark_position: s.position,
          watermark_text_opacity: s.opacity,
          watermark_text_font_size: s.fontSize,
          watermark_text_color: s.color,
          output_format: "png",
        };
  if (key === "text-to-scrolling-video")
    return {
      text: s.text,
      resolution: s.resolution,
      font_type: s.font,
      font_color: `${s.color}FF`,
      single_roll_duration: s.seconds,
      start_hold_duration: 2,
      end_hold_duration: 2,
    };
  if (key === "enhance-video-smoothness")
    return { alignSourceFps: s.alignSourceFps };
  return {};
}
