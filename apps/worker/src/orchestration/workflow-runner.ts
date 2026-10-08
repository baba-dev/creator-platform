import { createHash } from "node:crypto";
import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import {
  computeCanonicalRequestHash,
  evaluateExecutableSteps,
  evaluateStepRecovery,
  validateWorkflowGraphDAG,
  CreativeWorkflowService,
  GenerationToolAdapter,
  SpecialistMediaKitAdapter,
  type WorkflowGraph,
  type WorkflowStepAction,
  type OrchestrationTask,
} from "@aiwa/orchestration";

const generationAdapter = new GenerationToolAdapter();
const specialistAdapter = new SpecialistMediaKitAdapter();

function stableStepKey(workflowId: string, stepId: string): string {
  const d = createHash("sha256").update(`orchestration:${workflowId}:${stepId}`).digest("hex");
  const variant = ((Number.parseInt(d[16]!, 16) & 3) | 8).toString(16);
  return [d.slice(0, 8), d.slice(8, 12), `5${d.slice(13, 16)}`, `${variant}${d.slice(17, 20)}`, d.slice(20, 32)].join("-");
}
function adapterFor(task: OrchestrationTask) {
  if (generationAdapter.supportedTasks.includes(task)) return generationAdapter;
  if (specialistAdapter.supportedTasks.includes(task)) return specialistAdapter;
  return null;
}
type PersistedStep = {
  id: string; task: string; title: string; position: number; status: string;
  modelId: string | null; payload: unknown; quote: unknown; jobId: string | null;
  outputs: unknown; approvedAt: Date | null;
  dependencies: Array<{sourceStepId: string; outputIndex: number; role: string}>;
};
function asSteps(steps: PersistedStep[]): WorkflowStepAction[] {
  return steps.map(s => ({
    id: s.id, task: s.task as OrchestrationTask, title: s.title, position: s.position,
    status: s.status as WorkflowStepAction["status"],
    modelId: s.modelId ?? undefined,
    payload: (s.payload as Record<string, unknown>) ?? {},
    dependencies: s.dependencies.map(d => ({
      sourceStepId: d.sourceStepId, outputIndex: d.outputIndex,
      role: d.role as WorkflowStepAction["dependencies"][number]["role"],
    })),
    quote: (s.quote as WorkflowStepAction["quote"]) ?? undefined,
    jobId: s.jobId ?? undefined,
    outputs: (s.outputs as WorkflowStepAction["outputs"]) ?? [],
    approvedAt: s.approvedAt?.toISOString(),
  }));
}

/** Must be invoked from the authorized worker scheduler, never from a public request. */
export class OrchestrationWorkflowRunner {
  async processWorkflowTurn(workflowId: string): Promise<{dispatchedCount: number; errors: string[]}> {
    // Feature remains off until real-DB/ledger admission and crash-recovery tests pass.
    if (process.env.CREATIVE_ORCHESTRATION_EXECUTION_ENABLED !== "true")
      return {dispatchedCount: 0, errors: []};
    const workflow = await db.creativeWorkflow.findUnique({
      where: {id: workflowId},
      include: {
        thread: {select: {createdById: true, organizationId: true, threadType: true}},
        steps: {orderBy: {position: "asc"}, include: {dependencies: true}},
      },
    });
    if (!workflow || workflow.cancelledAt || workflow.completedAt ||
      workflow.thread.threadType !== "CREATIVE" || workflow.thread.organizationId !== workflow.organizationId)
      return {dispatchedCount: 0, errors: []};
    const actorId = workflow.thread.createdById;
    const member = await db.membership.findUnique({
      where: {organizationId_userId: {organizationId: workflow.organizationId, userId: actorId}},
      include: {organization: {select: {status: true}}},
    });
    if (!member || member.organization.status !== "ACTIVE" ||
      !hasOrganizationPermission(member.role, "generation:create"))
      return {dispatchedCount: 0, errors: ["Workflow creator has no current generation access."]};
    const graph: WorkflowGraph = {
      id: workflow.id, threadId: workflow.threadId, organizationId: workflow.organizationId,
      projectId: workflow.projectId, title: workflow.title, revision: workflow.revision,
      createdAt: workflow.createdAt.toISOString(), updatedAt: workflow.updatedAt.toISOString(),
      steps: asSteps(workflow.steps),
    };
    if (!validateWorkflowGraphDAG(graph).valid)
      return {dispatchedCount: 0, errors: ["Invalid stored workflow dependencies."]};
    const errors: string[] = [];
    let dispatchedCount = 0;
    // Reconcile linked jobs without re-admitting them or touching their wallet ledger.
    for (const step of graph.steps) {
      if (!["ADMITTING", "QUEUED", "RUNNING"].includes(step.status)) continue;
      const adapter = adapterFor(step.task);
      if (!adapter) continue;
      if (!step.jobId) {
        const stableKey = stableStepKey(workflowId, step.id);
        const canonicalKey = createHash("sha256")
          .update(`${workflow.organizationId}:${actorId}:${stableKey}`).digest("hex");
        const existing = generationAdapter.supportedTasks.includes(step.task)
          ? await db.generationJob.findFirst({where: {
            idempotencyKey: canonicalKey,organizationId: workflow.organizationId,createdById: actorId,
          },select:{id:true}})
          : await db.providerToolExecution.findFirst({where: {
            idempotencyKey: canonicalKey,organizationId: workflow.organizationId,createdById: actorId,
          },select:{id:true}});
        if (existing) {
          await CreativeWorkflowService.recordStepProgress({
            workflowId,stepId:step.id,status:"QUEUED",jobId:existing.id,
          });
        } else if (step.status === "ADMITTING" &&
          evaluateStepRecovery(step).recommendedAction === "MARK_MANUAL_REVIEW") {
          await CreativeWorkflowService.recordStepProgress({
            workflowId,stepId:step.id,status:"MANUAL_REVIEW",
          });
        }
        continue;
      }
      const status = await adapter.getStatus({
        organizationId:workflow.organizationId,userId:actorId,
        idempotencyKey:stableStepKey(workflowId,step.id),
      },step.jobId);
      if (["SUCCEEDED","FAILED","MANUAL_REVIEW"].includes(status.status) ||
        (step.status === "QUEUED" && status.status === "RUNNING")) {
        await CreativeWorkflowService.recordStepProgress({
          workflowId,stepId:step.id,status:status.status,jobId:step.jobId,
          outputs:status.outputs,
        });
      }
    }

    const latest = await db.creativeWorkflow.findUnique({
      where:{id:workflowId},include: {
        steps:{orderBy:{position:"asc"},include:{dependencies:true}},
      },
    });
    if (!latest || latest.cancelledAt) return {dispatchedCount,errors};
    graph.steps = asSteps(latest.steps);

    for (const candidate of evaluateExecutableSteps(graph)) {
      if (!candidate.canExecute) continue;
      const step = candidate.step, adapter = adapterFor(step.task);
      if (!adapter || !step.quote || !step.modelId || !step.approvedAt) continue;
      const sourceAssetIds: string[] = [];
      let sourcesValid = true;
      for (const dep of step.dependencies) {
        const upstream = graph.steps.find(s=>s.id===dep.sourceStepId);
        const assetId = upstream?.outputs.find(o=>o.outputIndex===dep.outputIndex)?.assetId;
        if (!assetId) {sourcesValid=false; break;}
        const asset = await db.asset.findFirst({
          where:{id:assetId,organizationId:workflow.organizationId,status:"READY",deletedAt:null,
            OR:[{purpose:{not:"REFERENCE_INPUT"}},{storageOwnerUserId:actorId}]},
          select:{id:true},
        });
        if (!asset) {sourcesValid=false;break;}
        sourceAssetIds.push(asset.id);
      }
      if (!sourcesValid) {errors.push("A workflow dependency is missing or unauthorized.");continue;}
      const expectedHash = computeCanonicalRequestHash({
        task:step.task,modelId:step.modelId,payload:step.payload,sourceAssetIds,
      });
      if (expectedHash !== step.quote.requestHash || Date.parse(step.quote.expiresAt) <= Date.now()) {
        errors.push("An approval expired or its inputs changed; re-quote this step.");
        continue;
      }
      // The transactional transition also rejects a concurrent worker's claim.
      try {
        await CreativeWorkflowService.recordStepProgress({workflowId,stepId:step.id,status:"ADMITTING"});
      } catch {
        continue;
      }
      try {
        const admitted = await adapter.admit({
          organizationId:workflow.organizationId,userId:actorId,
          idempotencyKey:stableStepKey(workflowId,step.id),
        },{
          task:step.task,modelId:step.modelId,quote:step.quote,payload:step.payload,sourceAssetIds,
        });
        await CreativeWorkflowService.recordStepProgress({
          workflowId,stepId:step.id,status:admitted.status,jobId:admitted.jobId,
        });
        dispatchedCount++;
      } catch {
        // A provider response might have been lost after acceptance; do not blindly retry.
        errors.push("Uncertain admission; canonical recovery required.");
        try {
          await CreativeWorkflowService.recordStepProgress({
            workflowId,stepId:step.id,status:"MANUAL_REVIEW",
          });
        } catch {
          // Another worker may have linked the durable job meanwhile.
        }
      }
    }
    return {dispatchedCount,errors};
  }
}
