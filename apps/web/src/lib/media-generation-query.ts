import type { Prisma } from "@aiwa/db";

export const MEDIA_GENERATION_KINDS = ["IMAGE", "VIDEO", "VOICE"] as const;
export type MediaGenerationKind = (typeof MEDIA_GENERATION_KINDS)[number];

/** Durable eligibility is assigned at admission and backfilled for legacy rows.
 * Do not negate a missing JSON task path: SQL NULL excludes ordinary media jobs.
 */
export function mediaGenerationJobFilter(kind?: MediaGenerationKind): Prisma.GenerationJobWhereInput {
  return {
    mediaHistoryEligible: true,
    providerModel: { mediaKind: kind ?? { in: [...MEDIA_GENERATION_KINDS] } },
  };
}
