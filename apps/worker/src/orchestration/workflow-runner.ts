import {
  evaluateExecutableSteps,
  evaluateStepRecovery,
  CreativeWorkflowService,
  GenerationToolAdapter,
  SpecialistMediaKitAdapter,
  type WorkflowGraph,
  type WorkflowStepAction,
  type StepOutput,
} from "@aiwa/orchestration";
import { db } from "@aiwa/db";
import { withMediaCapacity } from "@aiwa/assets/media-capacity";

export class OrchestrationWorkflowRunner {
  private generationAdapter = new GenerationToolAdapter();
  private mediaKitAdapter = new SpecialistMediaKitAdapter();

  /**
   * Runs an execution cycle for a workflow:
   * - Evaluates which approved steps have satisfied dependencies.
   * - Dispatches them behind media capacity gate.
   * - Updates step status and records safe events.
   */
  async processWorkflowTurn(
    workflowId: string,
    actorId: string,
  ): Promise<{
    dispatchedCount: number;
    errors: string[];
  }> {
    const workflow = await db.creativeWorkflow.findUnique({
      where: { id: workflowId },
      include: {
        steps: {
          orderBy: { position: "asc" },
          include: { dependencies: true, dependents: true },
        },
      },
    });

    if (!workflow || workflow.cancelledAt || workflow.completedAt) {
      return { dispatchedCount: 0, errors: [] };
    }

    const workflowGraph: WorkflowGraph = {
      id: workflow.id,
      threadId: workflow.threadId,
      organizationId: workflow.organizationId,
      projectId: workflow.projectId,
      title: workflow.title,
      revision: workflow.revision,
      createdAt: workflow.createdAt.toISOString(),
      updatedAt: workflow.updatedAt.toISOString(),
      steps: workflow.steps.map((s) => ({
        id: s.id,
        task: s.task as any,
        title: s.title,
        position: s.position,
        status: s.status as any,
        modelId: s.modelId ?? undefined,
        payload: (s.payload as Record<string, unknown>) ?? {},
        dependencies: s.dependencies.map((d) => ({
          sourceStepId: d.sourceStepId,
          outputIndex: d.outputIndex,
          role: d.role as any,
        })),
        quote: (s.quote as any) ?? undefined,
        jobId: s.jobId ?? undefined,
        outputs: (s.outputs as any) ?? [],
        approvedAt: s.approvedAt?.toISOString(),
        error: s.error ?? undefined,
      })),
    };

    const candidates = evaluateExecutableSteps(workflowGraph);
    const readySteps = candidates
      .filter((c) => c.canExecute)
      .map((c) => c.step);

    let dispatchedCount = 0;
    const errors: string[] = [];

    for (const step of readySteps) {
      try {
        await this.dispatchStep(
          workflow.organizationId,
          actorId,
          workflow.id,
          step,
        );
        dispatchedCount++;
      } catch (err: any) {
        errors.push(
          `Step ${step.id} dispatch failed: ${err?.message ?? String(err)}`,
        );
        await CreativeWorkflowService.recordStepProgress({
          workflowId: workflow.id,
          stepId: step.id,
          status: "FAILED",
          error: err?.message ?? "Execution failure",
        });
      }
    }

    return { dispatchedCount, errors };
  }

  private async dispatchStep(
    organizationId: string,
    actorId: string,
    workflowId: string,
    step: WorkflowStepAction,
  ): Promise<void> {
    if (!step.quote) {
      throw new Error("Cannot dispatch billable step without approved quote.");
    }

    const adapter = this.generationAdapter.supportedTasks.includes(step.task)
      ? this.generationAdapter
      : this.mediaKitAdapter.supportedTasks.includes(step.task)
        ? this.mediaKitAdapter
        : null;

    if (!adapter) {
      throw new Error(`No adapter available for task ${step.task}`);
    }

    await CreativeWorkflowService.recordStepProgress({
      workflowId,
      stepId: step.id,
      status: "ADMITTING",
    });

    const admission = await adapter.admit(
      {
        organizationId,
        userId: actorId,
        idempotencyKey: `${workflowId}-${step.id}-${Date.now()}`,
      },
      {
        task: step.task,
        modelId: step.modelId ?? step.quote.modelId,
        quote: step.quote,
        payload: step.payload,
        sourceAssetIds: [],
      },
    );

    await CreativeWorkflowService.recordStepProgress({
      workflowId,
      stepId: step.id,
      status: admission.status,
      jobId: admission.jobId,
    });
  }
}
