import { z } from "zod";

const id = z.string().min(1).max(100);
const clip = z
  .object({
    id: z.uuid(),
    assetId: id,
    inMs: z.number().int().min(0),
    outMs: z.number().int().positive(),
    muted: z.boolean().default(false),
    transition: z.enum(["cut", "fade"]).default("cut"),
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
export const videoEditAssetIds = (document: VideoEditDocument) => [
  ...new Set([
    ...document.clips.map((item) => item.assetId),
    ...(document.voiceover ? [document.voiceover.assetId] : []),
    ...(document.soundtrack ? [document.soundtrack.assetId] : []),
  ]),
];

export const videoDurationMs = (document: VideoEditDocument) =>
  document.clips.reduce((sum, item) => sum + item.outMs - item.inMs, 0);
