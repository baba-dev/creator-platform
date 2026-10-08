import { z } from "zod";
import type { StepStatus } from "../contracts/index";

export const WorkflowEventTypeSchema = z.enum([
  "WORKFLOW_CREATED",
  "STEP_VALIDATED",
  "STEP_QUOTED",
  "STEP_APPROVED",
  "STEP_ADMITTED",
  "STEP_STARTED",
  "STEP_PROGRESS",
  "STEP_SUCCEEDED",
  "STEP_FAILED",
  "STEP_RECOVERY_STARTED",
  "STEP_CANCELLED",
  "WORKFLOW_COMPLETED",
]);
export type WorkflowEventType = z.infer<typeof WorkflowEventTypeSchema>;

export const WorkflowEventSchema = z.object({
  id: z.string().min(1).max(128),
  workflowId: z.string().min(1).max(128),
  stepId: z.string().min(1).max(128).optional(),
  type: WorkflowEventTypeSchema,
  status: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  timestamp: z.string().datetime(),
});
export type WorkflowEvent = z.infer<typeof WorkflowEventSchema>;

/**
 * Creates redacted event ensuring no customer media URLs, secrets, or raw private prompts are leaked.
 */
export function createSafeWorkflowEvent(params: {
  id: string;
  workflowId: string;
  stepId?: string;
  type: WorkflowEventType;
  status?: StepStatus;
  payload?: Record<string, unknown>;
}): WorkflowEvent {
  const safePayload: Record<string, unknown> = {};
  if (params.payload) {
    for (const [k, v] of Object.entries(params.payload)) {
      if (/key|secret|token|password|auth|url|prompt/i.test(k)) {
        // Redact or omit sensitive fields
        safePayload[k] = "[REDACTED]";
      } else {
        safePayload[k] = v;
      }
    }
  }

  return {
    id: params.id,
    workflowId: params.workflowId,
    stepId: params.stepId,
    type: params.type,
    status: params.status,
    payload: safePayload,
    timestamp: new Date().toISOString(),
  };
}
