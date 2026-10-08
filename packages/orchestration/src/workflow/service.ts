import { createHash } from "node:crypto";
import { db, type Prisma } from "@aiwa/db";
import { hasOrganizationPermission } from "@aiwa/authz";
import { quoteParameters, verifyGenerationQuote } from "@aiwa/generation";
import { z } from "zod";
import {
  computeCanonicalRequestHash,
  verifyStepApprovalGate,
} from "../approval/index";
import {
  OrchestrationTaskSchema,
  SourceRoleSchema,
  StepQuoteSchema,
  StepStatusSchema,
  type StepQuote,
  type StepStatus,
} from "../contracts/index";
import { MAX_WORKFLOW_STEPS } from "./index";
import {
  buildGenerationAdmissionRequest,
  GenerationToolAdapter,
} from "../adapters/generation-adapter";
import { SpecialistMediaKitAdapter } from "../adapters/specialist-mediakit-adapter";

const createSchema = z
  .object({
    threadId: z.string().min(1).max(128),
    organizationId: z.string().min(1).max(128),
    actorId: z.string().min(1).max(128),
    projectId: z.string().min(1).max(128).nullable().optional(),
    requestKey: z.uuid(),
    title: z.string().trim().min(1).max(160),
    steps: z
      .array(
        z
          .object({
            position: z
              .number()
              .int()
              .min(0)
              .max(MAX_WORKFLOW_STEPS - 1),
            task: OrchestrationTaskSchema,
            title: z.string().trim().min(1).max(160),
            modelId: z.string().min(1).max(128).optional(),
            payload: z.record(z.string(), z.unknown()),
            dependencies: z
              .array(
                z
                  .object({
                    sourceStepPosition: z
                      .number()
                      .int()
                      .min(0)
                      .max(MAX_WORKFLOW_STEPS - 1),
                    outputIndex: z.number().int().min(0).max(10),
                    role: SourceRoleSchema,
                  })
                  .strict(),
              )
              .max(MAX_WORKFLOW_STEPS)
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_WORKFLOW_STEPS),
  })
  .strict();

async function assertActor(
  tx: Prisma.TransactionClient,
  orgId: string,
  userId: string,
  threadId: string,
) {
  const thread = await tx.chatThread.findFirst({
    where: {
      id: threadId,
      organizationId: orgId,
      createdById: userId,
      threadType: "CREATIVE",
    },
    select: { id: true, projectId: true },
  });
  if (!thread) throw new Error("Creative conversation unavailable.");
  const member = await tx.membership.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId } },
    include: { organization: { select: { status: true } } },
  });
  if (
    !member ||
    member.organization.status !== "ACTIVE" ||
    !hasOrganizationPermission(member.role, "generation:create")
  )
    throw new Error("Not authorized to create paid generation workflows.");
  return thread;
}

const NEXT: Record<string, readonly string[]> = {
  DRAFT: ["VALIDATED", "QUOTED", "AWAITING_APPROVAL", "CANCELLED"],
  VALIDATED: ["QUOTED", "AWAITING_APPROVAL", "CANCELLED"],
  QUOTED: ["AWAITING_APPROVAL", "CANCELLED"],
  AWAITING_APPROVAL: ["ADMITTING", "CANCELLED"],
  WAITING_DEPENDENCY: ["AWAITING_APPROVAL", "ADMITTING", "CANCELLED"],
  ADMITTING: ["QUEUED", "RUNNING", "FAILED", "MANUAL_REVIEW"],
  QUEUED: ["RUNNING", "SUCCEEDED", "FAILED", "MANUAL_REVIEW"],
  RUNNING: ["SUCCEEDED", "FAILED", "MANUAL_REVIEW"],
  NEEDS_INPUT: ["VALIDATED", "CANCELLED"],
  NEEDS_REVIEW: ["AWAITING_APPROVAL", "CANCELLED"],
  FAILED: [],
  SUCCEEDED: [],
  CANCELLED: [],
  MANUAL_REVIEW: [],
};

export class CreativeWorkflowService {
  static async createWorkflow(raw: z.input<typeof createSchema>) {
    const input = createSchema.parse(raw);
    if (JSON.stringify(input).length > 32000)
      throw new Error("Workflow request is too large.");
    const sorted = [...input.steps].sort((a, b) => a.position - b.position);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i]!.position !== i)
        throw new Error("Workflow steps must have consecutive positions.");
      for (const dep of sorted[i]!.dependencies ?? []) {
        if (dep.sourceStepPosition >= i)
          throw new Error("Step dependency must point to an earlier step.");
      }
    }
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ ...input, steps: sorted }))
      .digest("hex");
    return db.$transaction(async (tx) => {
      const thread = await assertActor(
        tx,
        input.organizationId,
        input.actorId,
        input.threadId,
      );
      if ((thread.projectId ?? null) !== (input.projectId ?? null))
        throw new Error("Workflow project does not match its conversation.");
      if (input.projectId) {
        const project = await tx.project.findFirst({
          where: {
            id: input.projectId,
            organizationId: input.organizationId,
            archivedAt: null,
          },
          select: { id: true },
        });
        if (!project) throw new Error("Project unavailable.");
      }
      await tx.$queryRaw`SELECT id FROM ChatThread WHERE id = ${input.threadId} FOR UPDATE`;
      const existing = await tx.creativeWorkflow.findUnique({
        where: {
          threadId_requestKey: {
            threadId: input.threadId,
            requestKey: input.requestKey,
          },
        },
      });
      if (existing) {
        const metadata = existing.metadata as Record<string, unknown> | null;
        if (metadata?.requestHash !== requestHash)
          throw new Error("Request key was reused for a different workflow.");
        return tx.creativeWorkflow.findUnique({
          where: { id: existing.id },
          include: {
            steps: {
              orderBy: { position: "asc" },
              include: { dependencies: true, dependents: true },
            },
            events: { orderBy: { createdAt: "asc" }, take: 50 },
          },
        });
      }
      const workflow = await tx.creativeWorkflow.create({
        data: {
          threadId: input.threadId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          requestKey: input.requestKey,
          title: input.title,
          revision: 1,
          status: "DRAFT",
          metadata: { requestHash },
        },
      });
      const created = [];
      for (const step of sorted) {
        created.push(
          await tx.creativeWorkflowStep.create({
            data: {
              workflowId: workflow.id,
              position: step.position,
              task: step.task,
              title: step.title,
              modelId: step.modelId,
              payload: step.payload as Prisma.InputJsonValue,
              status: "DRAFT",
            },
          }),
        );
      }
      for (let i = 0; i < sorted.length; i++) {
        const seen = new Set<string>();
        for (const dep of sorted[i]!.dependencies ?? []) {
          const key = `${dep.sourceStepPosition}:${dep.outputIndex}:${dep.role}`;
          if (seen.has(key)) throw new Error("Repeated dependency.");
          seen.add(key);
          await tx.creativeWorkflowDependency.create({
            data: {
              stepId: created[i]!.id,
              sourceStepId: created[dep.sourceStepPosition]!.id,
              outputIndex: dep.outputIndex,
              role: dep.role,
            },
          });
        }
      }
      await tx.creativeWorkflowEvent.create({
        data: {
          workflowId: workflow.id,
          type: "WORKFLOW_CREATED",
          status: "DRAFT",
          payload: { stepCount: sorted.length },
        },
      });
      return tx.creativeWorkflow.findUnique({
        where: { id: workflow.id },
        include: {
          steps: {
            orderBy: { position: "asc" },
            include: { dependencies: true, dependents: true },
          },
          events: { orderBy: { createdAt: "asc" }, take: 50 },
        },
      });
    });
  }

  static async approveStep(params: {
    workflowId: string;
    stepId: string;
    actorId: string;
    organizationId: string;
    quote: StepQuote;
  }) {
    const quote = StepQuoteSchema.parse(params.quote);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM CreativeWorkflow WHERE id = ${params.workflowId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM CreativeWorkflowStep WHERE id = ${params.stepId} FOR UPDATE`;
      const step = await tx.creativeWorkflowStep.findFirst({
        where: { id: params.stepId, workflowId: params.workflowId },
        include: {
          workflow: true,
          dependencies: { include: { sourceStep: true } },
        },
      });
      if (
        !step ||
        step.workflow.organizationId !== params.organizationId ||
        step.workflow.cancelledAt ||
        step.workflow.completedAt
      )
        throw new Error("Workflow or step unavailable.");
      await assertActor(
        tx,
        params.organizationId,
        params.actorId,
        step.workflow.threadId,
      );
      if (
        !["DRAFT", "VALIDATED", "QUOTED"].includes(step.status) ||
        step.approvedAt ||
        step.jobId
      )
        throw new Error("Step has already changed or was approved.");
      const sourceAssetIds: string[] = [];
      for (const dep of step.dependencies) {
        if (dep.sourceStep.status !== "SUCCEEDED")
          throw new Error("Source step has not completed.");
        const outputs = Array.isArray(dep.sourceStep.outputs)
          ? dep.sourceStep.outputs
          : [];
        const output = outputs.find(
          (item) =>
            !!item &&
            typeof item === "object" &&
            !Array.isArray(item) &&
            (item as Record<string, unknown>).outputIndex === dep.outputIndex,
        );
        if (
          !output ||
          typeof output !== "object" ||
          Array.isArray(output) ||
          typeof output.assetId !== "string"
        )
          throw new Error("Source output unavailable.");
        const asset = await tx.asset.findFirst({
          where: {
            id: output.assetId,
            organizationId: params.organizationId,
            status: "READY",
            deletedAt: null,
            OR: [
              { purpose: { not: "REFERENCE_INPUT" } },
              { storageOwnerUserId: params.actorId },
            ],
          },
          select: { id: true },
        });
        if (!asset) throw new Error("Source asset is no longer authorized.");
        sourceAssetIds.push(asset.id);
      }
      if (!step.modelId || quote.modelId !== step.modelId)
        throw new Error("Approved model mismatch.");
      const expectedHash = computeCanonicalRequestHash({
        task: step.task,
        modelId: step.modelId,
        payload: step.payload as Record<string, unknown>,
        sourceAssetIds,
      });
      const gate = verifyStepApprovalGate({
        approval: {
          stepId: step.id,
          revision: step.workflow.revision,
          requestHash: quote.requestHash,
          modelId: quote.modelId,
          priceVersionId: quote.priceVersionId,
          sourceAssetIds,
          actorId: params.actorId,
          organizationId: params.organizationId,
          quoteToken: quote.quoteToken,
          expiresAt: quote.expiresAt,
        },
        currentStepVersion: step.workflow.revision,
        expectedRequestHash: expectedHash,
        currentActorId: params.actorId,
        currentOrgId: params.organizationId,
        expectedStepId: step.id,
        expectedModelId: step.modelId,
        expectedPriceVersionId: quote.priceVersionId,
        expectedSourceAssetIds: sourceAssetIds,
      });
      if (!gate.approved) throw new Error(gate.reason);
      if (
        new GenerationToolAdapter().supportedTasks.includes(step.task as never)
      ) {
        const request = buildGenerationAdmissionRequest(
          {
            organizationId: params.organizationId,
            userId: params.actorId,
            idempotencyKey: "00000000-0000-4000-8000-000000000000",
          },
          {
            task: OrchestrationTaskSchema.parse(step.task),
            modelId: step.modelId,
            payload: step.payload as Record<string, unknown>,
            sourceAssetIds,
          },
          quote.priceVersionId,
        );
        const model = await tx.providerModel.findFirst({
          where: {
            id: step.modelId,
            enabled: true,
            priceVersions: { some: { id: quote.priceVersionId } },
          },
          select: { mediaKind: true },
        });
        if (!model)
          throw new Error("Selected model or price no longer exists.");
        verifyGenerationQuote(
          quote.quoteToken,
          {
            organizationId: params.organizationId,
            userId: params.actorId,
            modelId: step.modelId,
            priceVersionId: quote.priceVersionId,
            parameters: quoteParameters(model.mediaKind, request),
          },
          BigInt(quote.maximumChargeCredits),
        );
      } else if (
        new SpecialistMediaKitAdapter().supportedTasks.includes(
          step.task as never,
        )
      ) {
        verifyGenerationQuote(
          quote.quoteToken,
          {
            organizationId: params.organizationId,
            userId: params.actorId,
            modelId: step.modelId,
            priceVersionId: quote.priceVersionId,
            parameters: {
              task: step.task,
              quantity: quote.unitQuantity,
              requestHash: quote.requestHash,
            },
          },
          BigInt(quote.maximumChargeCredits),
        );
      } else {
        throw new Error(
          "No audited native adapter is available for this step.",
        );
      }
      const updated = await tx.creativeWorkflowStep.update({
        where: { id: step.id },
        data: {
          status: "AWAITING_APPROVAL",
          quote: quote as unknown as Prisma.InputJsonValue,
          approvedAt: new Date(),
        },
      });
      await tx.creativeWorkflowEvent.create({
        data: {
          workflowId: step.workflowId,
          stepId: step.id,
          type: "STEP_APPROVED",
          status: "AWAITING_APPROVAL",
          payload: { actorId: params.actorId, quoteId: quote.quoteId },
        },
      });
      return updated;
    });
  }

  static async recordStepProgress(params: {
    workflowId: string;
    stepId: string;
    status: StepStatus;
    jobId?: string;
    outputs?: unknown;
    error?: string;
  }): Promise<{ id: string; status: string }> {
    StepStatusSchema.parse(params.status);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM CreativeWorkflow WHERE id = ${params.workflowId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM CreativeWorkflowStep WHERE id = ${params.stepId} FOR UPDATE`;
      const current = await tx.creativeWorkflowStep.findFirst({
        where: { id: params.stepId, workflowId: params.workflowId },
        include: { workflow: true },
      });
      if (!current || current.workflow.cancelledAt)
        throw new Error("Step or workflow unavailable.");
      if (!NEXT[current.status]?.includes(params.status))
        throw new Error(
          `Invalid step transition ${current.status} -> ${params.status}.`,
        );
      if (current.jobId && params.jobId && params.jobId !== current.jobId)
        throw new Error("A step cannot switch its canonical job.");
      const safeError = params.error
        ? "The step could not complete. Check its canonical job for details."
        : undefined;
      const updated = await tx.creativeWorkflowStep.update({
        where: { id: current.id },
        data: {
          status: params.status,
          ...(params.jobId ? { jobId: params.jobId } : {}),
          ...(params.outputs
            ? { outputs: params.outputs as Prisma.InputJsonValue }
            : {}),
          ...(safeError ? { error: safeError } : {}),
        },
      });
      await tx.creativeWorkflowEvent.create({
        data: {
          workflowId: params.workflowId,
          stepId: current.id,
          type:
            params.status === "SUCCEEDED"
              ? "STEP_SUCCEEDED"
              : params.status === "FAILED"
                ? "STEP_FAILED"
                : "STEP_PROGRESS",
          status: params.status,
          payload: {},
        },
      });
      return { id: updated.id, status: updated.status };
    });
  }
}
