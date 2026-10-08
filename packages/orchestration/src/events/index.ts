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
  const scrub = (key: string, value: unknown, depth: number): unknown => {
    if (/key|secret|token|password|auth|url|prompt|content|body|headers|cookie|credential/i.test(key))
      return "[REDACTED]";
    if (depth > 3) return "[REDACTED]";
    if (typeof value === "string")
      return value.length > 160 || /https?:\/\/|(?:bearer|basic)\s+|sk-[a-z0-9_-]{10,}/i.test(value)
        ? "[REDACTED]" : value;
    if (Array.isArray(value))
      return value.slice(0, 16).map(item => scrub("", item, depth + 1));
    if (value && typeof value === "object")
      return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .slice(0, 24).map(([k, v]) => [k, scrub(k, v, depth + 1)]));
    return typeof value === "number" && !Number.isFinite(value) ? null : value;
  };
  for (const [key, value] of Object.entries(params.payload ?? {}).slice(0, 24))
    safePayload[key] = scrub(key, value, 0);

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
