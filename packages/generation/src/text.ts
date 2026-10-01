import { createHash } from "node:crypto";
import {
  calculateBillableUnits,
  estimateGeneration,
  textProviderCostMicroUsd,
  reserveCreditsForJob,
  captureCreditsForJob,
  releaseOrRefundCredits,
} from "@aiwa/credits";
import { db } from "@aiwa/db";
import { assertAssignableProject } from "@aiwa/organizations";
import { createBytePlusProvider } from "@aiwa/providers/byteplus";
import {
  ProviderRequestError,
  type MediaGenerationProvider,
} from "@aiwa/providers";
import {
  GenerationError,
  assertWithinMonthlySpendingCap,
  priceCredits,
  quoteParameters,
  requireMembership,
  resolveGenerationTemplateId,
  textModelIds,
  textRequestSchema,
  verifyGenerationQuote,
} from "./index";

export interface TextGenerationOptions {
  provider?:
    MediaGenerationProvider | ReturnType<typeof createBytePlusProvider>;
}

export interface TextGenerationResult {
  jobId: string;
  status: "SUCCEEDED";
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  chargedCredits: number;
}

export async function executeTextGeneration(
  userId: string,
  raw: unknown,
  options?: TextGenerationOptions,
): Promise<TextGenerationResult> {
  const input = textRequestSchema.parse(raw);
  const key = createHash("sha256")
    .update(`${input.organizationId}:${userId}:${input.idempotencyKey}`)
    .digest("hex");

  const payload = {
    messages: input.messages,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
  };

  const txResult = await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM Organization WHERE id = ${input.organizationId} FOR UPDATE`;
      const member = await requireMembership(
        tx,
        input.organizationId,
        userId,
        true,
      );
      const templateId = await resolveGenerationTemplateId(
        tx,
        input.templateId,
        "TEXT",
      );

      const existing = await tx.generationJob.findUnique({
        where: { idempotencyKey: key },
      });
      if (existing) {
        const samePayload =
          existing.projectId === (input.projectId ?? null) &&
          existing.templateId === templateId &&
          existing.providerModelId === input.modelId &&
          existing.priceVersionId === input.priceVersionId &&
          JSON.stringify(existing.requestPayload) === JSON.stringify(payload);
        if (!samePayload) {
          throw new GenerationError(
            "Request key was already used for different inputs.",
            409,
          );
        }
        if (
          existing.status === "SUCCEEDED" &&
          existing.outputPayload &&
          typeof existing.outputPayload === "object" &&
          "content" in existing.outputPayload
        ) {
          const out = existing.outputPayload as {
            content: string;
            usage?: {
              promptTokens: number;
              completionTokens: number;
              totalTokens: number;
            };
          };
          return {
            job: existing,
            model: null,
            price: null,
            wallet: null,
            cachedResult: {
              jobId: existing.id,
              status: "SUCCEEDED" as const,
              content: out.content,
              usage: out.usage,
              chargedCredits: Number(existing.chargedCredits ?? 0n),
            },
          };
        }
        if (existing.status === "FAILED" || existing.status === "CANCELLED") {
          throw new GenerationError(
            "This request key belongs to a finalized generation. Submit a new request key to retry.",
            409,
          );
        }
        throw new GenerationError(
          "This generation request is already being processed.",
          409,
        );
      }

      await assertAssignableProject(tx, input.organizationId, input.projectId);
      const now = new Date();
      const modelRow = await tx.providerModel.findFirst({
        where: {
          id: input.modelId,
          enabled: true,
          provider: "BYTEPLUS",
          mediaKind: "TEXT",
          providerModelId: { in: textModelIds },
        },
        include: {
          priceVersions: {
            where: {
              effectiveFrom: { lte: now },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
            },
            orderBy: { effectiveFrom: "desc" },
            take: 1,
          },
        },
      });

      const priceRow = modelRow?.priceVersions[0];
      if (!modelRow || !priceRow || priceRow.id !== input.priceVersionId) {
        throw new GenerationError(
          "Model or price changed. Refresh and try again.",
          409,
        );
      }

      const promptText = input.messages
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");
      const pricing = estimateGeneration({
        price: priceRow,
        mediaKind: "TEXT",
        providerModelId: modelRow.providerModelId,
        text: promptText,
        units: input.maxTokens,
      });

      const credits = pricing.reservation.customerCredits;
      try {
        verifyGenerationQuote(
          input.quoteToken,
          {
            organizationId: input.organizationId,
            userId,
            modelId: modelRow.id,
            priceVersionId: priceRow.id,
            parameters: quoteParameters("TEXT", {
              text: promptText,
              units: input.maxTokens,
            }),
          },
          credits,
          now,
        );
      } catch (error) {
        throw new GenerationError(
          error instanceof Error ? error.message : "Quote is invalid.",
          409,
        );
      }

      await assertWithinMonthlySpendingCap(tx, {
        organizationId: input.organizationId,
        userId,
        cap: member.monthlySpendingCapCredits,
        additionalCredits: credits,
        now,
      });

      const walletRow = await tx.wallet.findUnique({
        where: { organizationId: input.organizationId },
      });
      if (!walletRow) {
        throw new GenerationError("Workspace wallet is unavailable.");
      }

      const createdJob = await tx.generationJob.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId ?? null,
          templateId,
          createdById: userId,
          providerModelId: modelRow.id,
          priceVersionId: priceRow.id,
          idempotencyKey: key,
          requestPayload: payload,
          status: "QUOTED",
          quotedAt: now,
          billableQuantity: pricing.billableQuantity,
          quotedUnits: pricing.units,
        },
      });

      await reserveCreditsForJob(tx, {
        walletId: walletRow.id,
        amountCredits: credits,
        idempotencyKey: `generation-reserve-${createdJob.id}`,
        jobId: createdJob.id,
      });

      await tx.auditEvent.create({
        data: {
          actorUserId: userId,
          organizationId: input.organizationId,
          action: "generation.queued",
          targetType: "GenerationJob",
          targetId: createdJob.id,
        },
      });

      const submittedJob = await tx.generationJob.update({
        where: { id: createdJob.id },
        data: { status: "SUBMITTED", submittedAt: now },
      });

      return {
        job: submittedJob,
        model: modelRow,
        price: priceRow,
        wallet: walletRow,
        cachedResult: null,
      };
    },
    { isolationLevel: "ReadCommitted", timeout: 15000 },
  );

  if (txResult.cachedResult) {
    return txResult.cachedResult;
  }

  const { job, model, price, wallet } = txResult;
  if (!model || !price || !wallet) {
    throw new GenerationError("Failed to initialize text generation.", 500);
  }

  const provider =
    options?.provider ??
    createBytePlusProvider({
      apiKey: process.env.BYTEPLUS_API_KEY,
      region:
        (process.env.BYTEPLUS_REGION as "ap-southeast-1" | "eu-west-1") ??
        "ap-southeast-1",
      modelArkBaseUrl: process.env.BYTEPLUS_MODELARK_BASE_URL,
    });

  let providerResponse;
  try {
    providerResponse = await provider.submit({
      idempotencyKey: key,
      modelId: model.providerModelId,
      mediaKind: "text",
      input: {
        messages: input.messages,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
      },
    });
  } catch (error) {
    const outcomeUnknown =
      !(error instanceof ProviderRequestError) || error.retryable;
    if (outcomeUnknown) {
      await db.generationJob.updateMany({
        where: { id: job.id, status: "SUBMITTED" },
        data: {
          status: "MANUAL_REVIEW",
          errorCode: "PROVIDER_OUTCOME_UNKNOWN",
          errorMessage:
            "The text provider outcome is unknown. Credits remain reserved to prevent duplicate billing; an operator can reconcile this job.",
        },
      });
      throw new GenerationError(
        "The provider response timed out or became unavailable. This request was not automatically retried to avoid duplicate billing.",
        503,
      );
    }
    await db.$transaction(async (tx) => {
      await releaseOrRefundCredits(tx, {
        walletId: wallet.id,
        jobId: job.id,
        reason: error.message,
      });
      await tx.generationJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          errorCode: error.code,
          errorMessage: error.message,
          completedAt: new Date(),
        },
      });
    });
    throw error;
  }

  const content =
    providerResponse.textOutput?.content ??
    (providerResponse.inlineOutputs?.[0]
      ? Buffer.from(
          providerResponse.inlineOutputs[0].dataBase64,
          "base64",
        ).toString("utf8")
      : "");

  if (providerResponse.status !== "succeeded" || !content) {
    await db.$transaction(async (tx) => {
      await releaseOrRefundCredits(tx, {
        walletId: wallet.id,
        jobId: job.id,
        reason: "Text provider returned invalid or empty response.",
      });
      await tx.generationJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          errorCode: "INVALID_PROVIDER_RESPONSE",
          errorMessage: "Text provider returned invalid or empty response.",
          completedAt: new Date(),
        },
      });
    });
    throw new ProviderRequestError(
      "Text provider returned invalid or empty response.",
      false,
      { code: "INVALID_PROVIDER_RESPONSE" },
    );
  }

  const recordedProviderResult = await db.generationJob.updateMany({
    where: { id: job.id, status: "SUBMITTED" },
    data: {
      status: "PROCESSING",
      providerRequestId: providerResponse.providerRequestId,
      errorCode: null,
      errorMessage: null,
    },
  });
  if (!recordedProviderResult.count) {
    throw new GenerationError(
      "Generation state changed before provider settlement.",
      409,
    );
  }

  const rawUsage = providerResponse.rawUsage as
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      }
    | undefined;

  const promptTokens = rawUsage?.prompt_tokens;
  const completionTokens = rawUsage?.completion_tokens;
  const reportedTotalTokens = rawUsage?.total_tokens;
  const usageIsReliable =
    Number.isSafeInteger(promptTokens) &&
    Number.isSafeInteger(completionTokens) &&
    Number.isSafeInteger(reportedTotalTokens) &&
    (promptTokens ?? -1) >= 0 &&
    (completionTokens ?? -1) >= 0 &&
    (reportedTotalTokens ?? 0) > 0 &&
    (reportedTotalTokens ?? 0) >= (promptTokens ?? 0) + (completionTokens ?? 0);

  const unitQuantity = BigInt(price.unitQuantity ?? 1000);
  const fallbackBillableQuantity = Math.max(
    1,
    job.billableQuantity ?? input.maxTokens,
  );
  const totalTokens = usageIsReliable
    ? (reportedTotalTokens as number)
    : fallbackBillableQuantity;
  const actualUnits = usageIsReliable
    ? calculateBillableUnits(BigInt(totalTokens), unitQuantity)
    : BigInt(
        Math.max(
          1,
          job.quotedUnits ??
            Number(
              calculateBillableUnits(
                BigInt(fallbackBillableQuantity),
                unitQuantity,
              ),
            ),
        ),
      );
  const cachedPromptTokens =
    rawUsage?.prompt_tokens_details?.cached_tokens ?? 0;
  const hasTextRateTable =
    price.usageRates &&
    typeof price.usageRates === "object" &&
    !Array.isArray(price.usageRates) &&
    (price.usageRates as Record<string, unknown>).estimator ===
      "byteplus-text-v1";
  let actualCost: bigint;
  let configuredCredits: bigint;
  try {
    actualCost =
      usageIsReliable && hasTextRateTable
        ? textProviderCostMicroUsd(price.usageRates, {
            promptTokens: promptTokens as number,
            completionTokens: completionTokens as number,
            cachedPromptTokens,
          })
        : price.providerCostMicroUsd * actualUnits;
    configuredCredits = priceCredits({
      ...price,
      providerCostMicroUsd: actualCost,
    });
  } catch {
    await db.generationJob.updateMany({
      where: { id: job.id, status: "PROCESSING" },
      data: {
        status: "MANUAL_REVIEW",
        errorCode: "INVALID_SETTLEMENT_USAGE",
        errorMessage:
          "Provider token usage could not be safely priced. Credits remain reserved for review.",
      },
    });
    throw new GenerationError(
      "Generation completed at the provider, but its token usage requires billing review.",
      409,
    );
  }

  const actualCredits =
    usageIsReliable || job.reservedCredits <= 0n
      ? configuredCredits
      : job.reservedCredits;
  const usage = usageIsReliable
    ? {
        promptTokens: promptTokens as number,
        completionTokens: completionTokens as number,
        totalTokens,
      }
    : undefined;

  if (actualCredits > job.reservedCredits) {
    await db.generationJob.updateMany({
      where: { id: job.id, status: "PROCESSING" },
      data: {
        status: "MANUAL_REVIEW",
        errorCode: "SETTLEMENT_EXCEEDS_RESERVATION",
        errorMessage:
          "Actual text usage exceeded the authorized quote. The original reservation remains held for review; no additional credits were charged.",
        actualProviderCostMicroUsd: actualCost,
        providerCostBasis: usageIsReliable
          ? hasTextRateTable
            ? "PROVIDER_USAGE"
            : "CONFIGURED_RATE"
          : "CONFIGURED_ESTIMATE",
        outputPayload: usage
          ? { content, usage, settlementPending: true }
          : { content, usageEstimated: true, settlementPending: true },
      },
    });
    throw new GenerationError(
      "Generation completed, but actual usage exceeded the authorized quote. No additional credits were charged.",
      409,
    );
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM GenerationJob WHERE id = ${job.id} FOR UPDATE`;
      const currentJob = await tx.generationJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      if (currentJob.status !== "PROCESSING") {
        throw new GenerationError(
          "Generation state changed before settlement.",
          409,
        );
      }
      await captureCreditsForJob(tx, {
        walletId: wallet.id,
        jobId: job.id,
        amountCredits: actualCredits,
        idempotencyKey: `generation-capture-${job.id}`,
        metadata: {
          ...(usage ?? {}),
          usageFallback: !usageIsReliable,
        },
      });

      await tx.generationJob.update({
        where: { id: job.id },
        data: {
          status: "SUCCEEDED",
          providerRequestId: providerResponse.providerRequestId,
          actualUnits: Number(actualUnits),
          billableQuantity: totalTokens,
          actualProviderCostMicroUsd: actualCost,
          providerCostBasis: usageIsReliable
            ? hasTextRateTable
              ? "PROVIDER_USAGE"
              : "CONFIGURED_RATE"
            : "CONFIGURED_ESTIMATE",
          completedAt: new Date(),
          outputPayload: usage
            ? { content, usage }
            : { content, usageEstimated: true },
          chargedCredits: actualCredits,
        },
      });

      await tx.auditEvent.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: userId,
          action: "generation.succeeded",
          targetType: "GenerationJob",
          targetId: job.id,
          metadata: {
            ...(usage ?? {}),
            usageFallback: !usageIsReliable,
            chargedCredits: actualCredits.toString(),
          },
        },
      });
    });
  } catch (error) {
    await db.generationJob.updateMany({
      where: { id: job.id, status: "PROCESSING" },
      data: {
        status: "MANUAL_REVIEW",
        errorCode: "SETTLEMENT_REVIEW_REQUIRED",
        errorMessage:
          "The provider completed this text generation, but billing settlement requires review. Credits remain reserved.",
        outputPayload: usage
          ? { content, usage, settlementPending: true }
          : { content, usageEstimated: true, settlementPending: true },
      },
    });
    throw error instanceof GenerationError
      ? error
      : new GenerationError(
          "Generation completed at the provider, but billing settlement requires review.",
          409,
        );
  }

  return {
    jobId: job.id,
    status: "SUCCEEDED",
    content,
    usage,
    chargedCredits: Number(actualCredits),
  };
}
