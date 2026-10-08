import type { WorkflowGraph, WorkflowStepAction } from "../workflow/index";

export interface ExecutionCandidate {
  step: WorkflowStepAction;
  canExecute: boolean;
  blockedReason?: string;
}

/**
 * Evaluates which steps in a workflow are currently ready for execution.
 * Rules:
 * - Step must be in AWAITING_APPROVAL or VALIDATED state with approval.
 * - All dependencies must be in SUCCEEDED state.
 * - Output assets from dependencies must be present and ready.
 */
export function evaluateExecutableSteps(
  workflow: WorkflowGraph,
): ExecutionCandidate[] {
  const stepMap = new Map<string, WorkflowStepAction>();
  for (const step of workflow.steps) {
    stepMap.set(step.id, step);
  }

  const results: ExecutionCandidate[] = [];

  for (const step of workflow.steps) {
    if (step.status !== "AWAITING_APPROVAL") {
      results.push({
        step,
        canExecute: false,
        blockedReason: `Step already in status ${step.status}`,
      });
      continue;
    }

    // Check all dependencies
    let depsSatisfied = true;
    let missingDepReason: string | undefined;

    for (const dep of step.dependencies) {
      const sourceStep = stepMap.get(dep.sourceStepId);
      if (!sourceStep) {
        depsSatisfied = false;
        missingDepReason = `Referenced step ${dep.sourceStepId} not found.`;
        break;
      }
      if (sourceStep.status !== "SUCCEEDED") {
        depsSatisfied = false;
        missingDepReason = `Dependency step ${dep.sourceStepId} is not finished (status: ${sourceStep.status}).`;
        break;
      }
      // Ensure the referenced output exists
      const output = sourceStep.outputs.find(
        (o) => o.outputIndex === dep.outputIndex,
      );
      if (!output || !output.assetId) {
        depsSatisfied = false;
        missingDepReason = `Dependency step ${dep.sourceStepId} did not produce output at index ${dep.outputIndex}.`;
        break;
      }
    }

    if (!depsSatisfied) {
      results.push({
        step,
        canExecute: false,
        blockedReason: missingDepReason,
      });
      continue;
    }

    // Dependencies satisfied! Check approval status
    if (!step.approvedAt || !step.quote) {
      results.push({
        step,
        canExecute: false,
        blockedReason: "Step requires user approval before execution.",
      });
      continue;
    }

    results.push({
      step,
      canExecute: true,
    });
  }

  return results;
}
