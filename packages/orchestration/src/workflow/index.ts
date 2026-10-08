import { z } from "zod";
import {
  StepStatusSchema,
  SourceRoleSchema,
  StepQuoteSchema,
  StepDependencyInputSchema,
  StepOutputSchema,
  OrchestrationTaskSchema,
  type StepStatus,
  type SourceRole,
  type StepQuote,
  type StepDependencyInput,
  type StepOutput,
  type OrchestrationTask,
} from "../contracts/index";

export const MAX_WORKFLOW_STEPS = 5;
export const MAX_IMAGES_PER_STEP = 4;

export const WorkflowStepActionSchema = z.object({
  id: z.string().min(1).max(128),
  task: OrchestrationTaskSchema,
  title: z.string().trim().min(1).max(160),
  position: z
    .number()
    .int()
    .min(0)
    .max(MAX_WORKFLOW_STEPS - 1),
  status: StepStatusSchema.default("DRAFT"),
  modelId: z.string().min(1).max(128).optional(),
  payload: z.record(z.string(), z.unknown()),
  dependencies: z.array(StepDependencyInputSchema).default([]),
  quote: StepQuoteSchema.optional(),
  jobId: z.string().min(1).max(191).optional(),
  outputs: z.array(StepOutputSchema).default([]),
  approvedAt: z.string().datetime().optional(),
  error: z.string().optional(),
});
export type WorkflowStepAction = z.infer<typeof WorkflowStepActionSchema>;

export const WorkflowGraphSchema = z
  .object({
    id: z.string().min(1).max(128),
    threadId: z.string().min(1).max(128),
    organizationId: z.string().min(1).max(128),
    projectId: z.string().min(1).max(128).nullable().optional(),
    title: z.string().trim().min(1).max(160),
    revision: z.number().int().min(1).default(1),
    steps: z.array(WorkflowStepActionSchema).min(1).max(MAX_WORKFLOW_STEPS),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    cancelledAt: z.string().datetime().nullable().optional(),
  })
  .strict();
export type WorkflowGraph = z.infer<typeof WorkflowGraphSchema>;

/**
 * Validates DAG property: no cycles, dependencies refer to strictly earlier positions,
 * and no self-references.
 */
export function validateWorkflowGraphDAG(workflow: WorkflowGraph): {
  valid: boolean;
  error?: string;
} {
  const stepIds = new Set<string>();
  const idToPosition = new Map<string, number>();

  for (const step of workflow.steps) {
    if (stepIds.has(step.id)) {
      return { valid: false, error: `Duplicate step id: ${step.id}` };
    }
    stepIds.add(step.id);
    idToPosition.set(step.id, step.position);
  }

  for (const step of workflow.steps) {
    for (const dep of step.dependencies) {
      if (dep.sourceStepId === step.id) {
        return {
          valid: false,
          error: `Step ${step.id} depends on itself.`,
        };
      }
      if (!stepIds.has(dep.sourceStepId)) {
        return {
          valid: false,
          error: `Step ${step.id} references non-existent step ${dep.sourceStepId}.`,
        };
      }
      const depPosition = idToPosition.get(dep.sourceStepId)!;
      if (depPosition >= step.position) {
        return {
          valid: false,
          error: `Step ${step.id} (position ${step.position}) depends on step ${dep.sourceStepId} (position ${depPosition}), which does not precede it.`,
        };
      }
    }
  }

  return { valid: true };
}

export * from "./service";
