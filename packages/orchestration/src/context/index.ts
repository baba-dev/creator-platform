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
      language: z.string().default("auto"),
      region: z.string().default("auto"),
      dialect: z.string().optional(),
    })
    .default({ language: "auto", region: "auto" }),
  pinnedModelIds: z.record(z.string(), z.string()).default({}),
  recentTurnSummaries: z.array(z.string()).max(10).default([]),
  activeAssetIds: z.array(z.string()).max(14).default([]),
  assetRoles: z.record(z.string(), SourceRoleSchema).default({}),
});
export type ProjectContextSnapshot = z.infer<
  typeof ProjectContextSnapshotSchema
>;

/**
 * Validates the shape of a context snapshot. Asset ownership MUST be resolved through the database before ingestion or execution; this pure function cannot prove tenant access.
 */
export function buildContextEnvelope(
  snapshot: ProjectContextSnapshot,
): ProjectContextSnapshot {
  return ProjectContextSnapshotSchema.parse(snapshot);
}
