import { createHash } from "node:crypto";
import { z } from "zod";

export const ApprovalVerificationPayloadSchema = z.object({
  stepId: z.string().min(1).max(128),
  revision: z.number().int().positive(),
  requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  modelId: z.string().min(1).max(128),
  priceVersionId: z.string().min(1).max(128),
  sourceAssetIds: z.array(z.string().min(1).max(128)),
  actorId: z.string().min(1).max(128),
  organizationId: z.string().min(1).max(128),
  quoteToken: z.string().min(1).max(2048),
  expiresAt: z.string().datetime(),
});
export type ApprovalVerificationPayload = z.infer<typeof ApprovalVerificationPayloadSchema>;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
  }
  if (typeof value === "number" && !Number.isFinite(value))
    throw new Error("Non-finite numbers cannot be included in a quote.");
  return value;
}

export function computeCanonicalRequestHash(params: {
  task: string;
  modelId: string;
  payload: Record<string, unknown>;
  sourceAssetIds: readonly string[];
}): string {
  return createHash("sha256").update(JSON.stringify(canonical({
    task: params.task,
    modelId: params.modelId,
    payload: params.payload,
    sourceAssetIds: [...params.sourceAssetIds].sort(),
  }))).digest("hex");
}

/** An identity/revision gate; signed quote validity is enforced separately by the service. */
export function verifyStepApprovalGate(params: {
  approval: ApprovalVerificationPayload;
  currentStepVersion: number;
  expectedRequestHash: string;
  currentActorId: string;
  currentOrgId: string;
  expectedStepId?: string;
  expectedModelId?: string;
  expectedPriceVersionId?: string;
  expectedSourceAssetIds?: readonly string[];
  now?: Date;
}): { approved: boolean; reason?: string } {
  const {approval, currentStepVersion, expectedRequestHash, currentActorId, currentOrgId} = params;
  const now = params.now ?? new Date();
  if (approval.revision !== currentStepVersion) return {approved: false, reason: "Step revision mismatch."};
  if (params.expectedStepId && approval.stepId !== params.expectedStepId)
    return {approved: false, reason: "Step mismatch."};
  if (approval.organizationId !== currentOrgId) return {approved: false, reason: "Organization mismatch."};
  if (approval.actorId !== currentActorId) return {approved: false, reason: "Actor mismatch."};
  if (params.expectedModelId && approval.modelId !== params.expectedModelId)
    return {approved: false, reason: "Model mismatch."};
  if (params.expectedPriceVersionId && approval.priceVersionId !== params.expectedPriceVersionId)
    return {approved: false, reason: "Price version mismatch."};
  if (params.expectedSourceAssetIds &&
    JSON.stringify([...approval.sourceAssetIds].sort()) !== JSON.stringify([...params.expectedSourceAssetIds].sort()))
    return {approved: false, reason: "Source assets changed."};
  if (approval.requestHash !== expectedRequestHash)
    return {approved: false, reason: "Request payload or source assets have changed since approval was granted."};
  const expires = Date.parse(approval.expiresAt);
  if (!Number.isFinite(expires) || expires <= now.getTime())
    return {approved: false, reason: "Quote approval has expired. Re-quote required."};
  return {approved: true};
}
