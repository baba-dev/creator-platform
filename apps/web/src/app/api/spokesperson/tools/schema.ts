import { z } from "zod";

const commonPostShape = {
  organizationId: z.string().min(1).max(128),
  assetId: z.string().min(1).max(128),
  idempotencyKey: z.uuid(),
} as const;

export const spokespersonToolRequestSchema = z.discriminatedUnion("tool", [
  z
    .object({
      ...commonPostShape,
      tool: z.literal("matting"),
      mattingFormat: z.enum(["WEBM", "MP4"]).default("WEBM"),
      backgroundColor: z.enum(["black", "white", "green"]).optional(),
    })
    .strict()
    .superRefine((value, context) => {
      if (
        value.mattingFormat !== "MP4" &&
        value.backgroundColor !== undefined
      ) {
        context.addIssue({
          code: "custom",
          path: ["backgroundColor"],
          message: "Background color is available only for MP4 matting output.",
        });
      }
    }),
  z.object({ ...commonPostShape, tool: z.literal("quality") }).strict(),
  z.object({ ...commonPostShape, tool: z.literal("smoothness") }).strict(),
]);
