import { z } from "zod";

/**
 * Canonical media kinds across Creators.
 */
export const MediaKindSchema = z.enum(["IMAGE", "VIDEO", "VOICE", "TEXT"]);
export type MediaKind = z.infer<typeof MediaKindSchema>;

/**
 * Unified tasks recognized across Studios, Conversations, and workflows.
 */
export const OrchestrationTaskSchema = z.enum([
  "chat",
  "character-chat",
  "scriptwriting",
  "creative-director",
  "brand-strategy",
  "story-planning",
  "prompt-enhancement",
  "speech-synthesis",
  "seed-audio-long-form",
  "transcription",
  "image-generation",
  "image-edit",
  "image-variation",
  "video-generation",
  "video-first-last-frame",
  "video-extend",
  "talking-avatar",
  "matte-portrait-video",
  "assess-video-quality",
  "enhance-video-smoothness",
  "video-trim",
  "video-render",
]);
export type OrchestrationTask = z.infer<typeof OrchestrationTaskSchema>;

/**
 * Step status lifecycle matching specification.
 */
export const StepStatusSchema = z.enum([
  "DRAFT",
  "VALIDATED",
  "QUOTED",
  "AWAITING_APPROVAL",
  "ADMITTING",
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "NEEDS_INPUT",
  "WAITING_DEPENDENCY",
  "NEEDS_REVIEW",
  "FAILED",
  "CANCELLED",
  "MANUAL_REVIEW",
]);
export type StepStatus = z.infer<typeof StepStatusSchema>;

/**
 * Source input roles.
 */
export const SourceRoleSchema = z.enum([
  "VISUAL_REFERENCE",
  "SOURCE_IMAGE",
  "SOURCE_VIDEO",
  "FIRST_FRAME",
  "LAST_FRAME",
  "DRIVING_AUDIO",
  "SOURCE_AUDIO",
  "REFERENCE_VOICE",
  "BRAND_CONTEXT",
  "CREATIVE_BRIEF",
  "GENERAL_CONTEXT",
]);
export type SourceRole = z.infer<typeof SourceRoleSchema>;

/**
 * An immutable quote record attached to a step or plan before approval.
 */
export const StepQuoteSchema = z.object({
  quoteId: z.string().min(1).max(128),
  quoteToken: z.string().min(1).max(2048),
  expiresAt: z.string().datetime(),
  modelId: z.string().min(1).max(128),
  provider: z.string().min(1).max(64),
  priceVersionId: z.string().min(1).max(128),
  pricingDimension: z.enum(["TOKEN", "REQUEST", "CHARACTER", "SECOND"]),
  unitQuantity: z.number().int().positive(),
  estimatedCredits: z.string().regex(/^[0-9]{1,38}$/),
  maximumChargeCredits: z.string().regex(/^[0-9]{1,38}$/),
  requestHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type StepQuote = z.infer<typeof StepQuoteSchema>;

/**
 * Resolved dependency input reference.
 */
export const StepDependencyInputSchema = z.object({
  sourceStepId: z.string().min(1).max(128),
  outputIndex: z.number().int().min(0).max(10).default(0),
  role: SourceRoleSchema,
});
export type StepDependencyInput = z.infer<typeof StepDependencyInputSchema>;

/**
 * Output representation produced by an executed step.
 */
export const StepOutputSchema = z.object({
  outputIndex: z.number().int().min(0).max(10),
  assetId: z.string().min(1).max(128).optional(),
  text: z.string().optional(),
  subtitleUrl: z.string().optional(),
  mimeType: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type StepOutput = z.infer<typeof StepOutputSchema>;
