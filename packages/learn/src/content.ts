import { z } from "zod";

export const learnTools = {
  image: "Image Studio",
  video: "Video Studio",
  speech: "Speech Studio",
  audio: "Audio Generation",
  spokesperson: "AI Spokesperson",
  "media-tools": "MediaKit",
  storage: "Storage",
  dashboard: "Dashboard",
} as const;
export const learnTypes = [
  "Guide",
  "Knowledge base",
  "Product story",
  "Use case",
] as const;
export const learnTopics = [
  "getting-started",
  "images",
  "video",
  "voice",
  "mediakit",
  "workspaces",
] as const;
export const slugSchema = z
  .string()
  .min(2)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .refine(
    (s) => !["topics", "feed", "preview", "start"].includes(s),
    "Reserved slug",
  );
export const contentSchema = z.object({
  title: z.string().max(240),
  slug: slugSchema,
  excerpt: z.string().max(500),
  html: z.string().max(150000),
  type: z.enum(learnTypes),
  topic: z.enum(learnTopics),
  tags: z.array(z.string().trim().min(1).max(40)).max(10),
  author: z.string().max(120),
  authorBio: z.string().max(500),
  coverId: z.string().max(100),
  coverAlt: z.string().max(500),
  focalX: z.number().min(0).max(100),
  focalY: z.number().min(0).max(100),
  seoTitle: z.string().max(240),
  description: z.string().max(500),
  socialImageId: z.string().max(100),
  noindex: z.boolean(),
  locale: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
  translationKey: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/),
  tool: z.enum([
    "",
    ...(Object.keys(learnTools) as [
      keyof typeof learnTools,
      ...(keyof typeof learnTools)[],
    ]),
  ]),
  ctaLabel: z.string().max(80),
  prompt: z.string().max(4000),
  featured: z.boolean(),
});
export type LearnContent = z.infer<typeof contentSchema>;
export function emptyContent(key: string): LearnContent {
  return {
    title: "",
    slug: `untitled-${key}`,
    excerpt: "",
    html: "<p></p>",
    type: "Guide",
    topic: "getting-started",
    tags: [],
    author: "Aiwa Creators",
    authorBio: "",
    coverId: "",
    coverAlt: "",
    focalX: 50,
    focalY: 50,
    seoTitle: "",
    description: "",
    socialImageId: "",
    noindex: false,
    locale: "en",
    translationKey: key,
    tool: "",
    ctaLabel: "Try it in Aiwa Creators",
    prompt: "",
    featured: false,
  };
}
export function mediaUrl(id: string) {
  return `/api/learn/media/${id}`;
}
