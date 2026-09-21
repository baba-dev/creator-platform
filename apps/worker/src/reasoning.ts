import { hasOrganizationPermission } from "@aiwa/authz";
import { db, type Prisma } from "@aiwa/db";
import { ProviderRequestError, type ReasoningProvider } from "@aiwa/providers";
import { type Job } from "bullmq";

type PromptEnhancementPayload = {
  task: "prompt-enhancement";
  systemPrompt: string;
  userPrompt: string;
  responseSchemaName: "prompt-enhancement-v1";
};

function readPromptEnhancementPayload(
  value: unknown,
): PromptEnhancementPayload {
  if (!value || typeof value !== "object")
    throw new Error("Invalid reasoning request payload");

  const payload = value as Record<string, unknown>;
  if (
    payload.task !== "prompt-enhancement" ||
    typeof payload.systemPrompt !== "string" ||
    typeof payload.userPrompt !== "string" ||
    !payload.userPrompt.trim() ||
    payload.userPrompt.length > 2000 ||
    payload.responseSchemaName !== "prompt-enhancement-v1"
  )
    throw new Error("Invalid reasoning request payload");

  return payload as PromptEnhancementPayload;
}

function readPromptEnhancementOutput(value: unknown): {
  enhancedPrompt: string;
} {
  if (!value || typeof value !== "object")
    throw new ProviderRequestError(
      "NVIDIA returned an invalid prompt enhancement result",
      true,
      { code: "INVALID_PROVIDER_RESPONSE" },
    );

  const enhancedPrompt = (value as Record<string, unknown>).enhancedPrompt;
  if (
    typeof enhancedPrompt !== "string" ||
    !enhancedPrompt.trim() ||
    enhancedPrompt.trim().length > 2000
  )
    throw new ProviderRequestError(
      "NVIDIA returned an invalid prompt enhancement result",
      true,
      { code: "INVALID_PROVIDER_RESPONSE" },
    );

  return { enhancedPrompt: enhancedPrompt.trim() };
}

async function ensureCurrentAccess(
  organizationId: string,
  userId: string,
): Promise<boolean> {
  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: { organizationId, userId },
    },
    select: {
      role: true,
      organization: { select: { status: true } },
      user: { select: { disabledAt: true } },
    },
  });

  return Boolean(
    membership &&
      !membership.user.disabledAt &&
      membership.organization.status === "ACTIVE" &&
      hasOrganizationPermission(membership.role, "generation:create"),
  );
}

async function failReasoningJob(
  jobId: string,
  organizationId: string,
  userId: string,
  code: string,
  message: string,
) {
  const updated = await db.reasoningJob.updateMany({
    where: { id: jobId, status: { in: ["QUEUED", "PROCESSING"] } },
    data: {
      status: "FAILED",
      errorCode: code,
      errorMessage: message,
      completedAt: new Date(),
    },
  });
  if (!updated.count) return;

  await db.auditEvent.create({
    data: {
      organizationId,
      actorUserId: userId,
      action: "reasoning.failed",
      targetType: "ReasoningJob",
      targetId: jobId,
      metadata: { errorCode: code },
    },
  });
}

export async function processReasoningJob(
  job: Job,
  nvidiaProvider: ReasoningProvider,
) {
  if (typeof job.data.jobId !== "string" || job.data.jobId !== job.id)
    throw new Error("Invalid reasoning queue payload");

  const jobId = job.data.jobId;
  const dbJob = await db.reasoningJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { providerModel: true },
  });

  if (dbJob.status !== "QUEUED") return;

  if (!(await ensureCurrentAccess(dbJob.organizationId, dbJob.createdById))) {
    await failReasoningJob(
      jobId,
      dbJob.organizationId,
      dbJob.createdById,
      "ACCESS_REVOKED",
      "Workspace access changed before prompt enhancement.",
    );
    return;
  }

  const claimed = await db.reasoningJob.updateMany({
    where: { id: jobId, status: "QUEUED" },
    data: {
      status: "PROCESSING",
      processingAt: dbJob.processingAt ?? new Date(),
      errorCode: null,
      errorMessage: null,
    },
  });
  if (!claimed.count) return;

  try {
    const payload = readPromptEnhancementPayload(dbJob.requestPayload);
    const result = await nvidiaProvider.complete({
      idempotencyKey: dbJob.idempotencyKey,
      modelId: dbJob.providerModel.providerModelId,
      systemPrompt: payload.systemPrompt,
      userPrompt: payload.userPrompt,
      responseSchemaName: payload.responseSchemaName,
    });
    const output = readPromptEnhancementOutput(result.content);

    await db.$transaction(async (tx) => {
      const updated = await tx.reasoningJob.updateMany({
        where: { id: jobId, status: "PROCESSING" },
        data: {
          status: "SUCCEEDED",
          providerRequestId: result.providerRequestId,
          outputPayload: output as Prisma.InputJsonValue,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          errorCode: null,
          errorMessage: null,
          completedAt: new Date(),
        },
      });
      if (!updated.count) return;

      await tx.auditEvent.create({
        data: {
          organizationId: dbJob.organizationId,
          actorUserId: dbJob.createdById,
          action: "reasoning.succeeded",
          targetType: "ReasoningJob",
          targetId: jobId,
          metadata: {
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
          },
        },
      });
    });
  } catch (error) {
    const isRetryable =
      error instanceof ProviderRequestError && error.retryable;
    const maxAttempts = job.opts.attempts ?? 2;
    const hasAnotherAttempt = job.attemptsMade + 1 < maxAttempts;

    if (isRetryable && hasAnotherAttempt) {
      await db.reasoningJob.updateMany({
        where: { id: jobId, status: "PROCESSING" },
        data: {
          status: "QUEUED",
          errorCode: error.code ?? "REASONING_RETRY",
          errorMessage: "Prompt enhancement will retry automatically.",
        },
      });
      throw error;
    }

    await failReasoningJob(
      jobId,
      dbJob.organizationId,
      dbJob.createdById,
      error instanceof ProviderRequestError
        ? (error.code ?? "REASONING_FAILED")
        : "REASONING_FAILED",
      error instanceof ProviderRequestError
        ? error.message
        : "Prompt enhancement could not be completed.",
    );
    throw error;
  }
}
