import type { Prisma } from "@aiwa/db";

export const MEDIA_GENERATION_KINDS = ["IMAGE", "VIDEO", "VOICE"] as const;

export type MediaGenerationKind = (typeof MEDIA_GENERATION_KINDS)[number];

export function mediaGenerationJobFilter(
  kind?: MediaGenerationKind,
): Prisma.GenerationJobWhereInput {
  return {
    providerModel: {
      mediaKind: kind ?? { in: [...MEDIA_GENERATION_KINDS] },
    },
    NOT: {
      requestPayload: {
        path: "$.task",
        equals: "transcription",
      },
    },
  };
}
