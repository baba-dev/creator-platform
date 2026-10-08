import { db, Prisma } from "@aiwa/db";
import {
  type WorkflowGraph,
  type WorkflowStepAction,
  type StepQuote,
  type StepStatus,
  validateWorkflowGraphDAG,
  computeCanonicalRequestHash,
  verifyStepApprovalGate,
  createSafeWorkflowEvent,
} from "@aiwa/orchestration";

export class CreativeWorkflowService {
  /**
   * Persists a validated creative workflow graph into MariaDB.
   */
  static async createWorkflow(params: {
    threadId: string;
    organizationId: string;
    projectId?: string | null;
    requestKey: string;
    title: string;
    steps: Array<{
      position: number;
      task: string;
      title: string;
      modelId?: string;
      payload: Record<string, unknown>;
      dependencies?: Array<{
        sourceStepPosition: number;
        outputIndex: number;
        role: string;
      }>;
    }>;
  }) {
    const { threadId, organizationId, projectId, requestKey, title, steps } =
      params;

    return db.$transaction(async (tx) => {
      const workflow = await tx.creativeWorkflow.create({
        data: {
          threadId,
          organizationId,
          projectId,
          requestKey,
          title,
          revision: 1,
          status: "DRAFT",
        },
      });

      const createdSteps: Array<{ id: string; position: number }> = [];

      for (const step of steps) {
        const createdStep = await tx.creativeWorkflowStep.create({
          data: {
            workflowId: workflow.id,
            position: step.position,
            task: step.task,
            title: step.title,
            modelId: step.modelId,
            payload: step.payload as Prisma.InputJsonValue,
            status: "DRAFT",
          },
        });
        createdSteps.push({ id: createdStep.id, position: step.position });
      }

      // Wire dependencies by matching source position
      for (const step of steps) {
        if (!step.dependencies || step.dependencies.length === 0) continue;
        const currentStepRecord = createdSteps.find(
          (s) => s.position === step.position,
        );
        if (!currentStepRecord) continue;

        for (const dep of step.dependencies) {
          const sourceStepRecord = createdSteps.find(
            (s) => s.position === dep.sourceStepPosition,
          );
          if (!sourceStepRecord) continue;

          await tx.creativeWorkflowDependency.create({
            data: {
              stepId: currentStepRecord.id,
              sourceStepId: sourceStepRecord.id,
              outputIndex: dep.outputIndex,
              role: dep.role,
            },
          });
        }
      }

      // Record event
      await tx.creativeWorkflowEvent.create({
        data: {
          workflowId: workflow.id,
          type: "WORKFLOW_CREATED",
          status: "DRAFT",
          payload: { stepCount: steps.length },
        },
      });

      return tx.creativeWorkflow.findUnique({
        where: { id: workflow.id },
        include: {
          steps: {
            orderBy: { position: "asc" },
            include: { dependencies: true, dependents: true },
          },
          events: { orderBy: { createdAt: "asc" } },
        },
      });
    });
  }

  /**
   * Approves a step in a workflow after verifying the cryptographic quote and approval gate.
   */
  static async approveStep(params: {
    workflowId: string;
    stepId: string;
    actorId: string;
    organizationId: string;
    quote: StepQuote;
  }) {
    const { workflowId, stepId, actorId, organizationId, quote } = params;

    return db.$transaction(async (tx) => {
      const step = await tx.creativeWorkflowStep.findUnique({
        where: { id: stepId },
        include: { workflow: true, dependencies: true },
      });

      if (!step || step.workflowId !== workflowId) {
        throw new Error("Step not found in specified workflow.");
      }

      if (step.workflow.organizationId !== organizationId) {
        throw new Error("Cross-organization approval forbidden.");
      }

      const expectedHash = computeCanonicalRequestHash({
        task: step.task,
        modelId: quote.modelId,
        payload: step.payload as Record<string, unknown>,
        sourceAssetIds: [],
      });

      const gateResult = verifyStepApprovalGate({
        approval: {
          stepId: step.id,
          revision: step.workflow.revision,
          requestHash: quote.requestHash,
          modelId: quote.modelId,
          priceVersionId: quote.priceVersionId,
          sourceAssetIds: [],
          actorId,
          organizationId,
          quoteToken: quote.quoteToken,
          expiresAt: quote.expiresAt,
        },
        currentStepVersion: step.workflow.revision,
        expectedRequestHash: expectedHash,
        currentActorId: actorId,
        currentOrgId: organizationId,
      });

      if (!gateResult.approved) {
        throw new Error(
          `Approval gate validation failed: ${gateResult.reason}`,
        );
      }

      const updatedStep = await tx.creativeWorkflowStep.update({
        where: { id: stepId },
        data: {
          status: "AWAITING_APPROVAL",
          quote: quote as unknown as Prisma.InputJsonValue,
          approvedAt: new Date(),
        },
      });

      await tx.creativeWorkflowEvent.create({
        data: {
          workflowId,
          stepId,
          type: "STEP_APPROVED",
          status: "AWAITING_APPROVAL",
          payload: { actorId, quoteId: quote.quoteId },
        },
      });

      return updatedStep;
    });
  }

  /**
   * Safe status transition with event recording.
   */
  static async recordStepProgress(params: {
    workflowId: string;
    stepId: string;
    status: StepStatus;
    jobId?: string;
    outputs?: unknown;
    error?: string;
  }) {
    const { workflowId, stepId, status, jobId, outputs, error } = params;

    return db.$transaction(async (tx) => {
      const updated = await tx.creativeWorkflowStep.update({
        where: { id: stepId },
        data: {
          status,
          ...(jobId ? { jobId } : {}),
          ...(outputs ? { outputs: outputs as Prisma.InputJsonValue } : {}),
          ...(error ? { error } : {}),
        },
      });

      await tx.creativeWorkflowEvent.create({
        data: {
          workflowId,
          stepId,
          type:
            status === "SUCCEEDED"
              ? "STEP_SUCCEEDED"
              : status === "FAILED"
                ? "STEP_FAILED"
                : "STEP_PROGRESS",
          status,
          payload: { ...(error ? { error } : {}) },
        },
      });

      return updated;
    });
  }
}
