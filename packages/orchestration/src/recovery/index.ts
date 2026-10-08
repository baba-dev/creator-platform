import type { WorkflowStepAction } from "../workflow/index";

export interface RecoveryAction {
  stepId: string;
  recommendedAction:
    "REPLAY_EXISTING_JOB" | "MARK_MANUAL_REVIEW" | "RETRY_DISPATCH" | "ABORT";
  reason: string;
}

/**
 * Deterministic recovery evaluation following AGENTS.md rules:
 * - Never blind resubmit if provider may have accepted the job (enter recovery or check durable job).
 * - Uncertain provider acceptance enters MANUAL_REVIEW.
 * - Replays linked canonical jobs without double spending.
 */
export function evaluateStepRecovery(step: WorkflowStepAction): RecoveryAction {
  if (step.jobId) {
    // There is an existing durable job associated
    return {
      stepId: step.id,
      recommendedAction: "REPLAY_EXISTING_JOB",
      reason: `Step has durable jobId ${step.jobId}. Reconcile status from canonical service rather than creating a new job.`,
    };
  }

  if (step.status === "ADMITTING") {
    // Crash during admission before jobId was recorded
    return {
      stepId: step.id,
      recommendedAction: "MARK_MANUAL_REVIEW",
      reason:
        "Worker died while admitting step without confirmed durable job ID. Manual review required to avoid duplicate charges.",
    };
  }

  if (step.status === "RUNNING") {
    return {
      stepId: step.id,
      recommendedAction: "MARK_MANUAL_REVIEW",
      reason:
        "Step was marked running without durable jobId. Requires operator review.",
    };
  }

  return {
    stepId: step.id,
    recommendedAction: "ABORT",
    reason: `Step status ${step.status} cannot be automatically recovered.`,
  };
}
