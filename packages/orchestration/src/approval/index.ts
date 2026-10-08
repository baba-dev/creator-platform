import { createHash } from "node:crypto";
import { z } from "zod";
import type { StepQuote } from "../contracts/index";

export const ApprovalVerificationPayloadSchema = z.object({
  stepId: z.string().min(1).max(128),
  revision: z.number().int().positive(),
  requestHash: z.string().min(1).max(128),
  modelId: z.string().min(1).max(128),
  priceVersionId: z.string().min(1).max(128),
  sourceAssetIds: z.array(z.string().min(1).max(128)),
  actorId: z.string().min(1).max(128),
  organizationId: z.string().min(1).max(128),
  quoteToken: z.string().min(1).max(2048),
  expiresAt: z.string().datetime(),
});
export type ApprovalVerificationPayload = z.infer<
  typeof ApprovalVerificationPayloadSchema
>;

/**
 * Computes deterministic request hash for matching quotes and approval.
 */
export function computeCanonicalRequestHash(params: {
  task: string;
  modelId: string;
  payload: Record<string, unknown>;
  sourceAssetIds: readonly string[];
}): string {
  const sortedSources = [...params.sourceAssetIds].sort();
  const canonicalPayload = JSON.stringify(
    params.payload,
    Object.keys(params.payload).sort(),
  );
  const str = `${params.task}:${params.modelId}:${sortedSources.join(",")}:${canonicalPayload}`;
  return createHash("sha256").update(str).digest("hex");
}

/**
 * Server-side quote verification before spends or job admissions.
 */
export function verifyStepApprovalGate(params: {
  approval: ApprovalVerificationPayload;
  currentStepVersion: number;
  expectedRequestHash: string;
  currentActorId: string;
  currentOrgId: string;
  now?: Date;
}): { approved: boolean; reason?: string } {
  const {
    approval,
    currentStepVersion,
    expectedRequestHash,
    currentActorId,
    currentOrgId,
  } = params;
  const now = params.now ?? new Date();

  if (approval.revision !== currentStepVersion) {
    return {
      approved: false,
      reason: `Step revision mismatch: quote was for revision ${approval.revision}, currently at ${currentStepVersion}.`,
    };
  }

  if (approval.organizationId !== currentOrgId) {
    return {
      approved: false,
      reason: `Organization mismatch: quote belonged to org ${approval.organizationId}.`,
    };
  }

  if (approval.actorId !== currentActorId) {
    return {
      approved: false,
      reason: `Actor mismatch: quote was approved by ${approval.actorId}, caller is ${currentActorId}.`,
    };
  }

  if (approval.requestHash !== expectedRequestHash) {
    return {
      approved: false,
      reason:
        "Request payload or source assets have changed since approval was granted.",
    };
  }

  if (new Date(approval.expiresAt).getTime() < now.getTime()) {
    return {
      approved: false,
      reason: "Quote approval has expired. Re-quote required.",
    };
  }

  return { approved: true };
}
