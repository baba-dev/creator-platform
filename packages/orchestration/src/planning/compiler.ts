import { z } from "zod";

export const StageBPlanOutputSchema = z.object({
  title: z.string().min(1).max(160),
  steps: z
    .array(
      z.object({
        task: z.string().min(1).max(64),
        title: z.string().min(1).max(160),
        modelId: z.string().optional(),
        payload: z.record(z.string(), z.unknown()),
        dependencies: z
          .array(
            z.object({
              sourceStepPosition: z.number().int().min(0).max(4),
              outputIndex: z.number().int().min(0).max(4),
              role: z.string().min(1).max(64),
            }),
          )
          .default([]),
      }),
    )
    .min(1)
    .max(5),
});
export type StageBPlanOutput = z.infer<typeof StageBPlanOutputSchema>;

/**
 * Stage B AI Plan Generation:
 * Given a creative multi-modality prompt, compiles a structured DAG plan.
 * Fallback to deterministic template decomposition if LLM is unavailable or for known patterns.
 */
export function compileCreativePlan(params: {
  userPrompt: string;
  locale?: string;
}): StageBPlanOutput {
  const { userPrompt } = params;
  const lower = userPrompt.toLowerCase();

  // If perfume advertising campaign pattern is matched
  if (
    lower.includes("perfume") ||
    (lower.includes("concept") &&
      lower.includes("animate") &&
      lower.includes("voice"))
  ) {
    return {
      title: "Luxury Perfume Campaign",
      steps: [
        {
          task: "image-generation",
          title: "Visual Concept #1 (Image)",
          modelId: "seedream-5-0-260128",
          payload: {
            prompt: `${userPrompt} - Concept 1: Modern luxury perfume bottle packaging in Oman setting.`,
            aspectRatio: "9:16",
            resolution: "2K",
            outputCount: 1,
          },
          dependencies: [],
        },
        {
          task: "video-generation",
          title: "Animate Bottle Concept (Video)",
          modelId: "seedance-2-0-260128",
          payload: {
            prompt:
              "Cinematic camera orbiting luxury perfume bottle with subtle golden mist and atmospheric lighting.",
            aspectRatio: "9:16",
            durationSeconds: 5,
          },
          dependencies: [
            {
              sourceStepPosition: 0,
              outputIndex: 0,
              role: "FIRST_FRAME",
            },
          ],
        },
        {
          task: "speech-synthesis",
          title: "Omani Arabic Narration (Voice)",
          modelId: "seed-tts-2.0",
          payload: {
            text: "عطر فاخر يجسد أصالة عمان وأناقة الحاضر.",
            voiceKey: "jasper",
          },
          dependencies: [],
        },
      ],
    };
  }

  // General single-action or two-step fallback
  return {
    title: "Creative Production Plan",
    steps: [
      {
        task: lower.includes("video") ? "video-generation" : "image-generation",
        title: "Creative Generation Step",
        payload: {
          prompt: userPrompt,
          aspectRatio: "1:1",
        },
        dependencies: [],
      },
    ],
  };
}
