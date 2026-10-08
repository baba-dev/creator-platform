import { z } from "zod";

const empty = z.object({}).strict();
const matting = z
  .object({
    format: z.enum(["WEBM", "MP4"]).default("WEBM"),
    background_color: z.enum(["black", "white", "green"]).optional(),
  })
  .strict()
  .refine(
    (v) => v.format === "MP4" || v.background_color === undefined,
    "Solid backgrounds require MP4",
  );
const watermarkLayout = {
  watermark_position: z
    .enum([
      "top_left",
      "top_center",
      "top_right",
      "left_center",
      "center",
      "right_center",
      "bottom_left",
      "bottom_center",
      "bottom_right",
    ])
    .default("bottom_right"),
  output_format: z.literal("png").default("png"),
};
const schemas: Record<string, z.ZodType<Record<string, unknown>>> = {
  "matte-portrait-video": matting,
  "matte-greenscreen-video": matting,
  "assess-video-quality": empty,
  "semantic-segment": empty,
  "lip-sync": empty,
  "enhance-video-smoothness": z
    .object({ alignSourceFps: z.boolean().default(true) })
    .strict(),
  "compress-image": z
    .object({
      quality: z.number().int().min(1).max(100).default(80),
      output_format: z.literal("jpeg").default("jpeg"),
    })
    .strict(),
  "slim-image": z
    .object({ output_format: z.literal("jpeg").default("jpeg") })
    .strict(),
  "face-blur-image": z
    .object({ output_format: z.literal("png").default("png") })
    .strict(),
  "crop-image": z.union([
    z
      .object({
        crop_mode: z.literal("directional").default("directional"),
        crop_position: z
          .enum(["center", "up", "bottom", "left", "right"])
          .default("center"),
        crop_width: z.number().int().min(1).max(10000),
        crop_height: z.number().int().min(1).max(10000),
        output_format: z.literal("png").default("png"),
      })
      .strict(),
    z
      .object({
        crop_mode: z.literal("custom"),
        custom_x1: z.number().int().min(0).max(9999),
        custom_y1: z.number().int().min(0).max(9999),
        custom_x2: z.number().int().min(1).max(10000),
        custom_y2: z.number().int().min(1).max(10000),
        output_format: z.literal("png").default("png"),
      })
      .strict()
      .refine(
        (v) => v.custom_x2 > v.custom_x1 && v.custom_y2 > v.custom_y1,
        "Crop must have positive area",
      ),
  ]),
  "mosaic-image": z
    .object({
      mosaic_type: z.literal("full-image").default("full-image"),
      mosaic_shape: z.enum(["rectangle", "circle"]).default("rectangle"),
      mosaic_step_x: z.number().int().min(1).max(1000).default(16),
      mosaic_step_y: z.number().int().min(1).max(1000).default(16),
      output_format: z.literal("png").default("png"),
    })
    .strict(),
  "add-image-watermark": z.union([
    z
      .object({
        ...watermarkLayout,
        watermark_type: z.literal("text").default("text"),
        watermark_text: z.string().trim().min(1).max(64),
        watermark_text_font_size: z.number().int().min(8).max(200).default(24),
        watermark_text_color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .default("#FFFFFF"),
        watermark_text_opacity: z.number().int().min(1).max(100).default(50),
      })
      .strict(),
    z
      .object({
        ...watermarkLayout,
        watermark_type: z.literal("image"),
        watermark_image_opacity: z.number().int().min(1).max(100).default(100),
      })
      .strict(),
  ]),
  "text-to-scrolling-video": z
    .object({
      text: z.string().trim().min(1).max(2000),
      resolution: z.enum(["360p", "480p", "720p", "1080p"]).default("720p"),
      font_type: z
        .enum(["inter", "roboto", "source_han_serif"])
        .default("inter"),
      font_color: z
        .string()
        .regex(/^#[0-9a-fA-F]{8}$/)
        .default("#1F1F1FFF"),
      single_roll_duration: z.number().min(0.5).max(60).default(3),
      start_hold_duration: z.number().min(0).max(60).default(2),
      end_hold_duration: z.number().min(0).max(60).default(2),
    })
    .strict(),
};

export function parseMediaToolInput(
  key: string,
  input: unknown,
): Record<string, unknown> {
  const schema = schemas[key];
  if (!schema) throw new Error("Unsupported MediaKit tool");
  return schema.parse(input);
}

export function mediaToolSourceRoles(
  key: string,
  input?: Record<string, unknown>,
): readonly string[] {
  if (key === "lip-sync") return ["SOURCE_VIDEO", "SOURCE_AUDIO"];
  if (key === "add-image-watermark" && input?.watermark_type === "image")
    return ["SOURCE_IMAGE", "WATERMARK_IMAGE"];
  if (key === "text-to-scrolling-video") return ["SOURCE_IMAGE"];
  return key.endsWith("image") ? ["SOURCE_IMAGE"] : ["SOURCE_VIDEO"];
}

export function mediaToolImageInputFits(
  input: Record<string, unknown>,
  width: number | null,
  height: number | null,
): boolean {
  if (input.crop_mode !== "custom") return true;
  return Boolean(
    width &&
    height &&
    Number(input.custom_x2) <= width &&
    Number(input.custom_y2) <= height,
  );
}

// Layout depends on provider font wrapping. Reserve an explicit conservative
// ceiling: at most one page per Unicode code point plus entry/exit pages.
// Final billing always uses provider-reported output duration, never this ceiling.
export function scrollingDurationCeiling(
  input: Record<string, unknown>,
): number {
  return Math.ceil(
    (Array.from(String(input.text)).length + 2) *
      Number(input.single_roll_duration) +
      Number(input.start_hold_duration) +
      Number(input.end_hold_duration),
  );
}
