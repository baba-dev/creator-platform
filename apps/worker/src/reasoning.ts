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
    enhancedPrompt.length > 4000
  )
    throw new ProviderRequestError(
      "NVIDIA returned an invalid prompt enhancement result",
      true,
      { code: "INVALID_PROVIDER_RESPONSE" },
    );

  return { enhancedPrompt: enhancedPrompt.trim() };
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

  if (dbJob.status !== "QUEUED" && dbJob.status !== "PROCESSING") return;

  const claimed = await db.reasoningJob.updateMany({
    where: { id: jobId, status: { in: ["QUEUED", "PROCESSING"] } },
    data: {
      status: "PROCESSING",
      processingAt: dbJob.processingAt ?? new Date(),
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

    await db.reasoningJob.update({
      where: { id: jobId },
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
  } catch (error) {
    const isRetryable =
      error instanceof ProviderRequestError && error.retryable;
    const maxAttempts = job.opts.attempts ?? 3;
    const hasAnotherAttempt = job.attemptsMade + 1 < maxAttempts;

    if (isRetryable && hasAnotherAttempt) throw error;

    await db.reasoningJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        errorCode:
          error instanceof ProviderRequestError
            ? (error.code ?? "REASONING_FAILED")
            : "REASONING_FAILED",
        errorMessage:
          error instanceof ProviderRequestError
            ? error.message
            : "Prompt enhancement could not be completed.",
        completedAt: new Date(),
      },
    });
    throw error;
  }
}
