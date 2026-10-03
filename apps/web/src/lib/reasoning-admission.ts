import { hasOrganizationPermission, type OrganizationRole } from "@aiwa/authz";
import {
  estimateReasoningProviderCost,
  parseTextUsageRatesForProvider,
} from "@aiwa/credits";
import { db, Prisma } from "@aiwa/db";
import { supportsStudioTask } from "@aiwa/providers";

import { getProviderRuntimeReadiness } from "./provider-readiness";

export const MAX_ACTIVE_REASONING_JOBS_PER_USER = 3;
export const MAX_REASONING_JOBS_PER_HOUR = 60;
export const PROMPT_ENHANCEMENT_MAX_OUTPUT_TOKENS = 2048;

export class ReasoningAdmissionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSeconds = 0,
  ) {
    super(message);
    this.name = "ReasoningAdmissionError";
  }
}

export class ReasoningAdmissionLimitError extends ReasoningAdmissionError {
  constructor(message: string, status: number, retryAfterSeconds: number) {
    super(message, status, retryAfterSeconds);
    this.name = "ReasoningAdmissionLimitError";
  }
}

export interface AdmitReasoningJobInput {
  organizationId: string;
  userId: string;
  providerModelId: string;
  priceVersionId: string;
  idempotencyKey: string;
  userPrompt: string;
  targetMedia: "IMAGE" | "VIDEO";
  systemPrompt: string;
}

function capabilityRecord(value: unknown): Record<string, boolean | number | string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, boolean | number | string>;
}

export async function admitReasoningJob(
  input: AdmitReasoningJobInput,
  txClient?: Prisma.TransactionClient,
) {
  const execute = async (tx: Prisma.TransactionClient) => {
    // Serialize admission per user/workspace, then re-check authorization inside
    // the same transaction. Route-level checks are only early rejection.
    const lockedMembership = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM Membership
      WHERE organizationId = ${input.organizationId}
        AND userId = ${input.userId}
      FOR UPDATE
    `;
    if (lockedMembership.length !== 1) {
      throw new ReasoningAdmissionError("Access denied.", 403);
    }

    const membership = await tx.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: input.organizationId,
          userId: input.userId,
        },
      },
      select: {
        role: true,
        organization: { select: { status: true } },
      },
    });
    if (
      !membership ||
      membership.organization.status !== "ACTIVE" ||
      !hasOrganizationPermission(
        membership.role as OrganizationRole,
        "generation:create",
      )
    ) {
      throw new ReasoningAdmissionError("Access denied.", 403);
    }

    // Idempotency is bound to the exact model as well as the prompt. Never
    // reinterpret a retry as permission to switch providers.
    const existing = await tx.reasoningJob.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      const payload = existing.requestPayload as {
        task?: unknown;
        userPrompt?: unknown;
        targetMedia?: unknown;
      };
      if (
        existing.organizationId !== input.organizationId ||
        existing.providerModelId !== input.providerModelId ||
        (existing.priceVersionId !== null &&
          existing.priceVersionId !== input.priceVersionId) ||
        payload.task !== "prompt-enhancement" ||
        payload.userPrompt !== input.userPrompt ||
        payload.targetMedia !== input.targetMedia
      ) {
        throw new ReasoningAdmissionLimitError(
          "Idempotency key was already used for different inputs.",
          409,
          0,
        );
      }
      return { job: existing, isExisting: true };
    }

    const now = new Date();
    const model = await tx.providerModel.findUnique({
      where: { id: input.providerModelId },
      select: {
        id: true,
        provider: true,
        providerModelId: true,
        displayName: true,
        mediaKind: true,
        enabled: true,
        capabilities: true,
      },
    });
    if (
      !model ||
      !model.enabled ||
      !supportsStudioTask(
        {
          id: model.providerModelId,
          provider: model.provider,
          mediaKind: model.mediaKind,
          capabilities: capabilityRecord(model.capabilities),
        },
        "prompt-enhancement",
      ) ||
      !getProviderRuntimeReadiness({
        provider: model.provider,
        mediaKind: model.mediaKind,
        providerModelId: model.providerModelId,
      }).configured
    ) {
      throw new ReasoningAdmissionError(
        "The selected prompt enhancement model is unavailable.",
        409,
      );
    }

    const price = await tx.modelPriceVersion.findUnique({
      where: { id: input.priceVersionId },
    });
    if (
      !price ||
      price.providerModelId !== model.id ||
      price.providerCostMicroUsd <= 0n ||
      price.effectiveFrom > now ||
      (price.effectiveTo !== null && price.effectiveTo <= now)
    ) {
      throw new ReasoningAdmissionError(
        "Prompt enhancement pricing changed. Choose the model again.",
        409,
      );
    }

    if (price.pricingDimension === "TOKEN") {
      try {
        parseTextUsageRatesForProvider(price.usageRates, model.provider);
      } catch {
        throw new ReasoningAdmissionError(
          "Prompt enhancement pricing is invalid for this provider.",
          409,
        );
      }
    } else if (price.pricingDimension !== "REQUEST") {
      throw new ReasoningAdmissionError(
        "Prompt enhancement pricing is not supported for this model.",
        409,
      );
    }

    let costEstimate: ReturnType<typeof estimateReasoningProviderCost>;
    try {
      costEstimate = estimateReasoningProviderCost({
        price,
        promptCharacters: input.systemPrompt.length + input.userPrompt.length,
        maximumOutputTokens: PROMPT_ENHANCEMENT_MAX_OUTPUT_TOKENS,
      });
    } catch {
      throw new ReasoningAdmissionError(
        "Prompt enhancement pricing could not be estimated safely.",
        409,
      );
    }

    const [activeJobs, recentJobs] = await Promise.all([
      tx.reasoningJob.count({
        where: {
          createdById: input.userId,
          organizationId: input.organizationId,
          status: { in: ["QUEUED", "PROCESSING"] },
        },
      }),
      tx.reasoningJob.count({
        where: {
          createdById: input.userId,
          organizationId: input.organizationId,
          createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) },
        },
      }),
    ]);

    if (recentJobs >= MAX_REASONING_JOBS_PER_HOUR) {
      throw new ReasoningAdmissionLimitError(
        "Prompt enhancement hourly limit reached. Try again later.",
        429,
        60,
      );
    }

    if (activeJobs >= MAX_ACTIVE_REASONING_JOBS_PER_USER) {
      throw new ReasoningAdmissionLimitError(
        "Too many prompt enhancements are already running. Wait for one to finish.",
        429,
        5,
      );
    }

    const created = await tx.reasoningJob.create({
      data: {
        organizationId: input.organizationId,
        createdById: input.userId,
        providerModelId: model.id,
        priceVersionId: price.id,
        estimatedProviderCostMicroUsd: costEstimate.providerCostMicroUsd,
        providerCostBasis: costEstimate.basis,
        status: "QUEUED",
        queuedAt: now,
        idempotencyKey: input.idempotencyKey,
        requestPayload: {
          task: "prompt-enhancement",
          systemPrompt: input.systemPrompt,
          userPrompt: input.userPrompt,
          targetMedia: input.targetMedia,
          responseSchemaName: "prompt-enhancement-v1",
          modelSnapshot: {
            provider: model.provider,
            providerModelId: model.providerModelId,
            displayName: model.displayName,
            priceVersionId: price.id,
          },
        },
      },
    });

    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.userId,
        action: "reasoning.queued",
        targetType: "ReasoningJob",
        targetId: created.id,
        metadata: {
          task: "prompt-enhancement",
          provider: model.provider,
          providerModelId: model.providerModelId,
          priceVersionId: price.id,
          estimatedProviderCostMicroUsd:
            costEstimate.providerCostMicroUsd.toString(),
          providerCostBasis: costEstimate.basis,
        },
      },
    });

    return { job: created, isExisting: false };
  };

  if (txClient) {
    return execute(txClient);
  }
  return db.$transaction(execute, {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    timeout: 10_000,
  });
}
