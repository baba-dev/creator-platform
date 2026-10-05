import { z } from "zod";

const id = z.string().min(1).max(100);
const unit = z.number().min(0).max(1);
const crop = z
  .object({
    x: unit,
    y: unit,
    width: z.number().gt(0).max(1),
    height: z.number().gt(0).max(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.x + value.width > 1.000001)
      ctx.addIssue({
        code: "custom",
        path: ["width"],
        message: "Crop width must stay inside the source.",
      });
    if (value.y + value.height > 1.000001)
      ctx.addIssue({
        code: "custom",
        path: ["height"],
        message: "Crop height must stay inside the source.",
      });
  });

export const videoClipTransformSchema = z
  .object({
    crop,
    rotation: z.union([
      z.literal(0),
      z.literal(90),
      z.literal(180),
      z.literal(270),
    ]),
    flipX: z.boolean(),
  })
  .strict();

export type VideoClipTransform = z.infer<typeof videoClipTransformSchema>;

export const DEFAULT_VIDEO_CLIP_TRANSFORM: VideoClipTransform = {
  crop: { x: 0, y: 0, width: 1, height: 1 },
  rotation: 0,
  flipX: false,
};

const clip = z
  .object({
    id: z.uuid(),
    assetId: id,
    inMs: z.number().int().min(0),
    outMs: z.number().int().positive(),
    muted: z.boolean().default(false),
    transition: z.enum(["cut", "fade"]).default("cut"),
    // Optional by design so every persisted v1 document remains valid.
    transform: videoClipTransformSchema.optional(),
  })
  .strict();
const audio = z
  .object({
    assetId: id,
    startMs: z.number().int().min(0),
    inMs: z.number().int().min(0),
    outMs: z.number().int().positive(),
    volume: z.number().min(0).max(2).default(1),
    fadeInMs: z.number().int().min(0).max(5000).default(0),
    fadeOutMs: z.number().int().min(0).max(5000).default(0),
  })
  .strict();
const caption = z
  .object({
    id: z.uuid(),
    startMs: z.number().int().min(0),
    endMs: z.number().int().positive(),
    text: z.string().trim().min(1).max(240),
    language: z.enum(["en", "ar", "hi", "ur"]).default("en"),
  })
  .strict();

export const videoEditDocumentSchema = z
  .object({
    version: z.literal(1),
    ratio: z.enum(["16:9", "9:16", "1:1", "4:3", "3:4"]),
    resolution: z.enum(["720p", "1080p"]),
    clips: z.array(clip).min(1).max(24),
    voiceover: audio.nullable().default(null),
    soundtrack: audio.nullable().default(null),
    captions: z.array(caption).max(200).default([]),
    burnCaptions: z.boolean().default(false),
  })
  .strict()
  .superRefine((document, ctx) => {
    const duration = document.clips.reduce((sum, item, index) => {
      if (item.outMs <= item.inMs)
        ctx.addIssue({
          code: "custom",
          path: ["clips", index],
          message: "Clip end must follow its start.",
        });
      return sum + Math.max(0, item.outMs - item.inMs);
    }, 0);
    if (duration > 120_000)
      ctx.addIssue({
        code: "custom",
        path: ["clips"],
        message: "The edited video cannot exceed two minutes.",
      });
    for (const name of ["voiceover", "soundtrack"] as const) {
      const track = document[name];
      if (
        track &&
        (track.outMs <= track.inMs ||
          track.startMs + track.outMs - track.inMs > duration)
      )
        ctx.addIssue({
          code: "custom",
          path: [name],
          message: "Audio must fit within the video.",
        });
    }
    document.captions.forEach((item, index) => {
      if (item.endMs <= item.startMs || item.endMs > duration)
        ctx.addIssue({
          code: "custom",
          path: ["captions", index],
          message: "Caption must fit within the video.",
        });
    });
  });

export type VideoEditDocument = z.infer<typeof videoEditDocumentSchema>;

export const resolveVideoClipTransform = (
  transform: VideoClipTransform | undefined,
): VideoClipTransform =>
  transform
    ? {
        crop: { ...transform.crop },
        rotation: transform.rotation,
        flipX: transform.flipX,
      }
    : {
        crop: { ...DEFAULT_VIDEO_CLIP_TRANSFORM.crop },
        rotation: 0,
        flipX: false,
      };

export const videoOutputDimensions = (
  ratio: VideoEditDocument["ratio"],
  resolution: VideoEditDocument["resolution"],
): readonly [number, number] => {
  const is1080 = resolution === "1080p";
  const dimensions: Record<
    VideoEditDocument["ratio"],
    readonly [number, number]
  > = {
    "16:9": is1080 ? [1920, 1080] : [1280, 720],
    "9:16": is1080 ? [1080, 1920] : [720, 1280],
    "1:1": is1080 ? [1080, 1080] : [720, 720],
    "4:3": is1080 ? [1440, 1080] : [960, 720],
    "3:4": is1080 ? [1080, 1440] : [720, 960],
  };
  return dimensions[ratio];
};

export const videoAspectRatio = (ratio: VideoEditDocument["ratio"]) => {
  const [width, height] = videoOutputDimensions(ratio, "720p");
  return width / height;
};

export const videoEditAssetIds = (document: VideoEditDocument) => [
  ...new Set([
    ...document.clips.map((item) => item.assetId),
    ...(document.voiceover ? [document.voiceover.assetId] : []),
    ...(document.soundtrack ? [document.soundtrack.assetId] : []),
  ]),
];

export const videoDurationMs = (document: VideoEditDocument) =>
  document.clips.reduce((sum, item) => sum + item.outMs - item.inMs, 0);
