import { createHash } from "node:crypto";
import {
  calculateBillableUnits,
  estimateGeneration,
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
        if (
          existing.projectId !== (input.projectId ?? null) ||
          existing.templateId !== templateId ||
          existing.providerModelId !== input.modelId ||
          existing.priceVersionId !== input.priceVersionId
        ) {
          throw new GenerationError(
            "Request key was already used for different inputs.",
            409,
          );
        }
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
    await db.$transaction(async (tx) => {
      await releaseOrRefundCredits(tx, {
        walletId: wallet.id,
        jobId: job.id,
        reason:
          error instanceof Error
            ? error.message
            : "Text generation provider failure",
      });
      await tx.generationJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          errorCode:
            error instanceof ProviderRequestError
              ? error.code
              : "PROVIDER_ERROR",
          errorMessage:
            error instanceof Error ? error.message : "Text generation failed.",
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

  const rawUsage = providerResponse.rawUsage as
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      }
    | undefined;

  const promptTokens = rawUsage?.prompt_tokens ?? 0;
  const completionTokens = rawUsage?.completion_tokens ?? 0;
  const totalTokens =
    rawUsage?.total_tokens ?? (promptTokens + completionTokens || 1);
  const usage = { promptTokens, completionTokens, totalTokens };

  const unitQuantity = BigInt(price.unitQuantity ?? 1000);
  const actualUnits = calculateBillableUnits(BigInt(totalTokens), unitQuantity);
  const actualCost = price.providerCostMicroUsd * actualUnits;
  const actualCredits = priceCredits({
    ...price,
    providerCostMicroUsd: actualCost,
  });

  await db.$transaction(async (tx) => {
    await captureCreditsForJob(tx, {
      walletId: wallet.id,
      jobId: job.id,
      amountCredits: actualCredits,
      idempotencyKey: `generation-capture-${job.id}`,
      metadata: {
        promptTokens,
        completionTokens,
        totalTokens,
      },
    });

    await tx.generationJob.update({
      where: { id: job.id },
      data: {
        status: "SUCCEEDED",
        actualUnits: Number(actualUnits),
        billableQuantity: totalTokens,
        actualProviderCostMicroUsd: actualCost,
        providerCostBasis: "CONFIGURED_RATE",
        completedAt: new Date(),
        outputPayload: {
          content,
          usage,
        },
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
          promptTokens,
          completionTokens,
          totalTokens,
          chargedCredits: actualCredits.toString(),
        },
      },
    });
  });

  return {
    jobId: job.id,
    status: "SUCCEEDED",
    content,
    usage,
    chargedCredits: Number(actualCredits),
  };
}
