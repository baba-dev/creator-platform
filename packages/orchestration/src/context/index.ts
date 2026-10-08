import { z } from "zod";
import { SourceRoleSchema } from "../contracts/index";

export const ProjectContextSnapshotSchema = z.object({
  organizationId: z.string().min(1).max(128),
  projectId: z.string().min(1).max(128).nullable().optional(),
  brandProfile: z
    .object({
      brandName: z.string().optional(),
      primaryColor: z.string().optional(),
      guidelinesSummary: z.string().optional(),
    })
    .optional(),
  locale: z
    .object({
      language: z.string().default("ar"),
      region: z.string().default("OM"),
      dialect: z.string().optional(),
    })
    .default({ language: "ar", region: "OM" }),
  pinnedModelIds: z.record(z.string(), z.string()).default({}),
  recentTurnSummaries: z.array(z.string()).max(10).default([]),
  activeAssetIds: z.array(z.string()).max(14).default([]),
  assetRoles: z.record(z.string(), SourceRoleSchema).default({}),
});
export type ProjectContextSnapshot = z.infer<
  typeof ProjectContextSnapshotSchema
>;

/**
 * Validates that all active assets referenced in context belong exclusively to the given organization.
 */
export function buildContextEnvelope(
  snapshot: ProjectContextSnapshot,
): ProjectContextSnapshot {
  return ProjectContextSnapshotSchema.parse(snapshot);
}
