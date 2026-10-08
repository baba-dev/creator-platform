import { createHash } from "node:crypto";
import {
  normalizeCreativeLocaleIntent,
  type CreativeLocaleIntent,
} from "./locale";
import {
  calculateBillableUnits,
  estimateGeneration,
  textProviderCostMicroUsd,
  normalizeLegacyTextUsageRatesForProvider,
  reserveCreditsForJob,
  captureCreditsForJob,
  releaseOrRefundCredits,
} from "@aiwa/credits";
import { db, type Prisma } from "@aiwa/db";
import { assertAssignableProject } from "@aiwa/organizations";
import { createBytePlusProvider } from "@aiwa/providers/byteplus";
import {
  ProviderRequestError,
  type MediaGenerationProvider,
  type TextGenerationProvider,
} from "@aiwa/providers";
import {
  GenerationError,
  assertGenerationAdmission,
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
    | MediaGenerationProvider
    | TextGenerationProvider
    | ReturnType<typeof createBytePlusProvider>;
}

export interface TextJobAdmissionOptions {
  /**
   * Platform-sponsored jobs still use canonical pricing for provider-cost
   * accounting, but never reserve or capture customer wallet credits.
   */
  sponsored?: boolean;
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
  providerRequestId?: string;
}

export interface TextMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

type TextJobShape = {
  id: string;
  status: string;
  outputPayload: unknown;
  chargedCredits: bigint;
  errorMessage: string | null;
  providerRequestId?: string | null;
};

function capabilityContextWindow(capabilities: unknown): number {
  if (
    !capabilities ||
    typeof capabilities !== "object" ||
    Array.isArray(capabilities)
  )
    return 32_768;
  const value = (capabilities as Record<string, unknown>).contextWindow;
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 4_096 &&
    value <= 1_048_576
    ? value
    : 32_768;
}

function estimatedMessageTokens(message: TextMessage): number {
  // Mixed Arabic, code, punctuation-heavy prompts and identifiers can tokenize
  // much more densely than ordinary English prose. Keep admission conservative;
  // provider usage remains authoritative for settlement.
  return Math.max(1, Math.ceil(message.content.length / 2)) + 8;
}

/**
 * Keep the system contract and newest turns inside the selected model's context
 * envelope. This is deliberately conservative because provider tokenization
 * differs across English, Arabic, code, and mixed-language prompts.
 */
export function normalizeTextMessagesForModel(
  messages: readonly TextMessage[],
  capabilities: unknown,
  maxTokens: number,
): TextMessage[] {
  const contextWindow = capabilityContextWindow(capabilities);
  const reserved = maxTokens + 256;
  const promptBudget = Math.max(1_024, contextWindow - reserved);
  const systems = messages.filter((message) => message.role === "system");
  const turns = messages.filter((message) => message.role !== "system");
  const systemCost = systems.reduce(
    (sum, message) => sum + estimatedMessageTokens(message),
    0,
  );
  if (systemCost >= promptBudget)
    throw new GenerationError(
      "The system instructions exceed this model's context window.",
      400,
    );

  const selected: TextMessage[] = [];
  let used = systemCost;
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const message = turns[index]!;
    const cost = estimatedMessageTokens(message);
    if (used + cost > promptBudget) {
      if (selected.length === 0)
        throw new GenerationError(
          "The latest message is too large for this model's context window.",
          400,
        );
      break;
    }
    selected.push(message);
    used += cost;
  }
  selected.reverse();
  return [...systems, ...selected];
}

function requestFingerprint(input: {
  projectId?: string | null;
  templateId?: string;
  modelId: string;
  priceVersionId: string;
  messages: TextMessage[];
  temperature: number;
  maxTokens: number;
  responseFormat: "text" | "json_object";
  localeIntent?: CreativeLocaleIntent;
  chatOptions?: {
    autoVoice?: boolean;
    voiceKey?: string;
    speechRate?: number;
  };
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        projectId: input.projectId ?? null,
        templateId: input.templateId ?? null,
        modelId: input.modelId,
        priceVersionId: input.priceVersionId,
        messages: input.messages,
        ...(input.localeIntent
          ? { localeIntent: normalizeCreativeLocaleIntent(input.localeIntent) }
          : {}),
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        chatOptions: input.chatOptions ?? null,
        ...(input.responseFormat === "json_object"
          ? { responseFormat: "json_object" }
          : {}),
      }),
    )
    .digest("hex");
}

function payloadObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sameIdempotentRequest(
  existing: {
    projectId: string | null;
    templateId: string | null;
    providerModelId: string;
    priceVersionId: string;
    requestPayload: unknown;
  },
  input: {
    projectId?: string | null;
    templateId?: string;
    modelId: string;
    priceVersionId: string;
    messages: TextMessage[];
    temperature: number;
    maxTokens: number;
    responseFormat: "text" | "json_object";
    localeIntent?: CreativeLocaleIntent;
    chatOptions?: {
      autoVoice?: boolean;
      voiceKey?: string;
      speechRate?: number;
    };
  },
  resolvedTemplateId: string | null,
  sponsored: boolean,
): boolean {
  if (
    existing.projectId !== (input.projectId ?? null) ||
    existing.templateId !== resolvedTemplateId ||
    existing.providerModelId !== input.modelId ||
    existing.priceVersionId !== input.priceVersionId
  )
    return false;
  const existingPayload = payloadObject(existing.requestPayload);
  if ((existingPayload.sponsored === true) !== sponsored) return false;
  const hash = existingPayload.clientRequestHash;
  if (typeof hash === "string") return hash === requestFingerprint(input);
  return (
    JSON.stringify(existing.requestPayload) ===
    JSON.stringify({
      messages: input.messages,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      ...(input.responseFormat === "json_object"
        ? { responseFormat: "json_object" }
        : {}),
    })
  );
}

export function textResultFromJob(
  job: TextJobShape,
): TextGenerationResult | null {
  if (job.status === "SUCCEEDED") {
    const output = payloadObject(job.outputPayload);
    if (typeof output.content !== "string" || output.content.length === 0)
      throw new GenerationError(
        "Completed text generation has no usable output.",
        500,
      );
    const rawUsage = payloadObject(output.usage);
    const usage =
      Number.isSafeInteger(rawUsage.promptTokens) &&
      Number.isSafeInteger(rawUsage.completionTokens) &&
      Number.isSafeInteger(rawUsage.totalTokens)
        ? {
            promptTokens: Number(rawUsage.promptTokens),
            completionTokens: Number(rawUsage.completionTokens),
            totalTokens: Number(rawUsage.totalTokens),
          }
        : undefined;
    return {
      jobId: job.id,
      status: "SUCCEEDED",
      content: output.content,
      usage,
      chargedCredits: Number(job.chargedCredits),
      providerRequestId: job.providerRequestId ?? undefined,
    };
  }
  if (job.status === "FAILED" || job.status === "CANCELLED")
    throw new GenerationError(
      job.errorMessage ?? "Text generation did not complete.",
      409,
    );
  if (job.status === "MANUAL_REVIEW")
    throw new GenerationError(
      job.errorMessage ??
        "Text generation requires provider or billing reconciliation.",
      409,
    );
  return null;
}

/**
 * Admission only: validates, prices, reserves, and queues a durable TEXT job.
 * Provider I/O is intentionally excluded so web requests never call BytePlus.
 */
export async function createTextJob(
  userId: string,
  raw: unknown,
  options: TextJobAdmissionOptions = {},
) {
  const input = textRequestSchema.parse(raw);
  const sponsored = options.sponsored === true;
  const key = createHash("sha256")
    .update(`${input.organizationId}:${userId}:${input.idempotencyKey}`)
    .digest("hex");

  return db.$transaction(
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
        if (!sameIdempotentRequest(existing, input, templateId, sponsored))
          throw new GenerationError(
            "Request key was already used for different inputs.",
            409,
          );
        return existing;
      }

      await assertGenerationAdmission(tx, {
        organizationId: input.organizationId,
        userId,
      });
      await assertAssignableProject(tx, input.organizationId, input.projectId);
      const now = new Date();
      const modelRow = await tx.providerModel.findFirst({
        where: {
          id: input.modelId,
          enabled: true,
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
      if (!modelRow || !priceRow || priceRow.id !== input.priceVersionId)
        throw new GenerationError(
          "Model or price changed. Refresh the estimate and try again.",
          409,
        );
      if (priceRow.pricingDimension !== "TOKEN") {
        throw new GenerationError(
          "Paid text generation requires token pricing for this model.",
          409,
        );
      }
      let effectivePriceRow = priceRow;
      if (priceRow.usageRates != null) {
        try {
          effectivePriceRow = {
            ...priceRow,
            usageRates: normalizeLegacyTextUsageRatesForProvider(
              priceRow.usageRates,
              modelRow.provider,
            ) as unknown as typeof priceRow.usageRates,
          };
        } catch {
          throw new GenerationError(
            "The selected text model does not have valid provider token rates.",
            409,
          );
        }
      }

      const messages = normalizeTextMessagesForModel(
        input.messages,
        modelRow.capabilities,
        input.maxTokens,
      );
      const promptText = messages
        .map((message) => `${message.role}: ${message.content}`)
        .join("\n");
      const pricing = estimateGeneration({
        price: effectivePriceRow,
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
              responseFormat: input.responseFormat,
              localeIntent: input.localeIntent,
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

      const wallet = sponsored
        ? null
        : await tx.wallet.findUnique({
            where: { organizationId: input.organizationId },
          });
      if (!sponsored) {
        await assertWithinMonthlySpendingCap(tx, {
          organizationId: input.organizationId,
          userId,
          cap: member.monthlySpendingCapCredits,
          additionalCredits: credits,
          now,
        });
        if (!wallet)
          throw new GenerationError("Workspace wallet is unavailable.");
      }

      const job = await tx.generationJob.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId ?? null,
          templateId,
          createdById: userId,
          providerModelId: modelRow.id,
          priceVersionId: priceRow.id,
          idempotencyKey: key,
          chatThreadId: input.chatThreadId ?? null,
          requestPayload: {
            messages,
            ...(input.localeIntent
              ? {
                  localeIntent: normalizeCreativeLocaleIntent(
                    input.localeIntent,
                  ),
                }
              : {}),
            temperature: input.temperature,
            maxTokens: input.maxTokens,
            ...(input.responseFormat === "json_object"
              ? { responseFormat: "json_object" }
              : {}),
            sponsored,
            clientRequestId: input.idempotencyKey,
            ...(input.chatOptions ? { chatOptions: input.chatOptions } : {}),
            clientRequestHash: requestFingerprint(input),
          } as unknown as Prisma.InputJsonObject,
          status: "QUEUED",
          quotedAt: now,
          queuedAt: now,
          billableQuantity: pricing.billableQuantity,
          quotedUnits: pricing.units,
        },
      });

      if (!sponsored && wallet) {
        await reserveCreditsForJob(tx, {
          walletId: wallet.id,
          amountCredits: credits,
          idempotencyKey: `generation-reserve-${job.id}`,
          jobId: job.id,
        });
      }
      // Reservation changes the persisted status to CREDIT_RESERVED. Queue only
      // after it succeeds, in the same transaction, and return the durable row.
      const queuedJob = await tx.generationJob.update({
        where: { id: job.id },
        data: { status: "QUEUED", queuedAt: now },
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: userId,
          organizationId: input.organizationId,
          action: "generation.queued",
          targetType: "GenerationJob",
          targetId: job.id,
          metadata: { mediaKind: "TEXT", sponsored },
        },
      });
      return queuedJob;
    },
    { isolationLevel: "ReadCommitted", timeout: 15_000 },
  );
}

/** Repair admissions left reserved before any provider submission occurred. */
export async function recoverReservedTextJobs(): Promise<void> {
  await db.generationJob.updateMany({
    where: {
      status: "CREDIT_RESERVED",
      providerModel: { mediaKind: "TEXT" },
      submittedAt: null,
      providerRequestId: null,
      completedAt: null,
    },
    data: { status: "QUEUED", queuedAt: new Date() },
  });
}

async function failTextJob(
  id: string,
  expectedStatus: "QUEUED" | "SUBMITTED",
  message: string,
  errorCode: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM GenerationJob WHERE id = ${id} FOR UPDATE`;
    const current = await tx.generationJob.findUniqueOrThrow({
      where: { id },
    });
    if (current.status !== expectedStatus) return;
    const sponsored = payloadObject(current.requestPayload).sponsored === true;
    if (!sponsored) {
      const wallet = await tx.wallet.findUniqueOrThrow({
        where: { organizationId: current.organizationId },
      });
      await releaseOrRefundCredits(tx, {
        walletId: wallet.id,
        jobId: id,
        reason: message,
        idempotencyKey: `generation-release-${id}`,
      });
    }
    await tx.generationJob.update({
      where: { id },
      data: {
        status: "FAILED",
        errorCode,
        errorMessage: message,
        completedAt: new Date(),
      },
    });
  });
}

/**
 * Worker-only TEXT provider execution and settlement.
 */
export async function processTextJob(
  id: string,
  provider: MediaGenerationProvider | TextGenerationProvider,
): Promise<void> {
  const job = await db.generationJob.findUniqueOrThrow({
    where: { id },
    include: {
      providerModel: true,
      priceVersion: true,
    },
  });
  if (job.status !== "QUEUED" || job.providerModel.mediaKind !== "TEXT") return;

  try {
    await requireMembership(db, job.organizationId, job.createdById, true);
  } catch {
    await failTextJob(
      id,
      "QUEUED",
      "Workspace access changed before generation.",
      "WORKSPACE_ACCESS_CHANGED",
    );
    return;
  }

  const claimed = await db.generationJob.updateMany({
    where: { id, status: "QUEUED" },
    data: { status: "SUBMITTED", submittedAt: new Date() },
  });
  if (!claimed.count) return;

  const currentModel = await db.providerModel.findUnique({
    where: { id: job.providerModelId },
    select: { enabled: true },
  });
  if (!currentModel?.enabled) {
    await failTextJob(
      id,
      "SUBMITTED",
      "Selected text model was disabled before provider submission.",
      "MODEL_DISABLED",
    );
    return;
  }

  const payload = payloadObject(job.requestPayload);
  const sponsored = payload.sponsored === true;
  const messages = Array.isArray(payload.messages)
    ? (payload.messages as TextMessage[])
    : [];
  const temperature =
    typeof payload.temperature === "number" ? payload.temperature : 0.7;
  const maxTokens =
    typeof payload.maxTokens === "number" ? payload.maxTokens : 2048;
  const responseFormat =
    payload.responseFormat === "json_object" ? "json_object" : "text";
  if (!messages.length) {
    await failTextJob(
      id,
      "SUBMITTED",
      "Text generation payload is invalid.",
      "INVALID_REQUEST_PAYLOAD",
    );
    return;
  }

  let content = "";
  let providerRequestId: string | undefined;
  let rawUsage:
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      }
    | undefined;

  try {
    if ("chat" in provider) {
      const result = await provider.chat({
        idempotencyKey: job.idempotencyKey,
        modelId: job.providerModel.providerModelId,
        messages,
        temperature,
        maxTokens,
        responseFormat,
      });
      content = result.content;
      providerRequestId = result.providerRequestId;
      rawUsage = result.usage
        ? {
            prompt_tokens: result.usage.promptTokens,
            completion_tokens: result.usage.completionTokens,
            total_tokens: result.usage.totalTokens,
          }
        : undefined;
    } else {
      const providerResponse = await provider.submit({
        idempotencyKey: job.idempotencyKey,
        modelId: job.providerModel.providerModelId,
        mediaKind: "text",
        input: { messages, temperature, maxTokens, responseFormat },
      });
      content =
        providerResponse.textOutput?.content ??
        (providerResponse.inlineOutputs?.[0]
          ? Buffer.from(
              providerResponse.inlineOutputs[0].dataBase64,
              "base64",
            ).toString("utf8")
          : "");
      providerRequestId = providerResponse.providerRequestId;
      rawUsage = providerResponse.rawUsage as typeof rawUsage;
      if (providerResponse.status !== "succeeded")
        throw new ProviderRequestError(
          "Text provider returned an unsuccessful result.",
          false,
          { code: providerResponse.errorCode ?? "PROVIDER_REJECTED" },
        );
    }

    if (!content.trim())
      throw new ProviderRequestError(
        "Text provider returned invalid or empty response.",
        false,
        { code: "INVALID_PROVIDER_RESPONSE" },
      );
  } catch (error) {
    const outcomeUnknown =
      !(error instanceof ProviderRequestError) || error.retryable;
    if (outcomeUnknown) {
      await db.generationJob.updateMany({
        where: { id, status: "SUBMITTED" },
        data: {
          status: "MANUAL_REVIEW",
          errorCode: "PROVIDER_OUTCOME_UNKNOWN",
          errorMessage: sponsored
            ? "The text provider outcome is unknown. This sponsored generation requires operator reconciliation before retry."
            : "The text provider outcome is unknown. Credits remain reserved to prevent duplicate billing; an operator can reconcile this job.",
        },
      });
      return;
    }
    await failTextJob(
      id,
      "SUBMITTED",
      error.message,
      error.code ?? "PROVIDER_REJECTED",
    );
    return;
  }

  const recorded = await db.generationJob.updateMany({
    where: { id, status: "SUBMITTED" },
    data: {
      status: "PROCESSING",
      providerRequestId,
      errorCode: null,
      errorMessage: null,
    },
  });
  if (!recorded.count) return;

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

  const price = job.priceVersion;
  const unitQuantity = BigInt(price.unitQuantity ?? 1000);
  const fallbackBillableQuantity = Math.max(
    1,
    job.billableQuantity ?? maxTokens,
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
    ["byteplus-text-v1", "text-token-v1"].includes(
      String((price.usageRates as Record<string, unknown>).estimator),
    );

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
      where: { id, status: "PROCESSING" },
      data: {
        status: "MANUAL_REVIEW",
        errorCode: "INVALID_SETTLEMENT_USAGE",
        errorMessage: sponsored
          ? "Provider token usage could not be safely priced for this sponsored generation."
          : "Provider token usage could not be safely priced. Credits remain reserved for review.",
        outputPayload: { content, settlementPending: true },
      },
    });
    return;
  }

  const actualCredits = sponsored
    ? 0n
    : usageIsReliable || job.reservedCredits <= 0n
      ? configuredCredits
      : job.reservedCredits;
  const usage = usageIsReliable
    ? {
        promptTokens: promptTokens as number,
        completionTokens: completionTokens as number,
        totalTokens,
      }
    : undefined;

  if (!sponsored && actualCredits > job.reservedCredits) {
    await db.generationJob.updateMany({
      where: { id, status: "PROCESSING" },
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
    return;
  }

  const wallet = sponsored
    ? null
    : await db.wallet.findUniqueOrThrow({
        where: { organizationId: job.organizationId },
      });

  try {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM GenerationJob WHERE id = ${id} FOR UPDATE`;
      const currentJob = await tx.generationJob.findUniqueOrThrow({
        where: { id },
      });
      if (currentJob.status !== "PROCESSING") return;

      if (!sponsored && wallet) {
        await captureCreditsForJob(tx, {
          walletId: wallet.id,
          jobId: id,
          amountCredits: actualCredits,
          idempotencyKey: `generation-capture-${id}`,
          metadata: {
            ...(usage ?? {}),
            usageFallback: !usageIsReliable,
          },
        });
      }
      await tx.generationJob.update({
        where: { id },
        data: {
          status: "SUCCEEDED",
          providerRequestId,
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
          organizationId: job.organizationId,
          actorUserId: job.createdById,
          action: "generation.succeeded",
          targetType: "GenerationJob",
          targetId: id,
          metadata: {
            ...(usage ?? {}),
            usageFallback: !usageIsReliable,
            chargedCredits: actualCredits.toString(),
            sponsored,
          },
        },
      });
    });
  } catch {
    await db.generationJob.updateMany({
      where: { id, status: "PROCESSING" },
      data: {
        status: "MANUAL_REVIEW",
        errorCode: "SETTLEMENT_REVIEW_REQUIRED",
        errorMessage: sponsored
          ? "The provider completed this sponsored text generation, but provider-cost settlement requires review."
          : "The provider completed this text generation, but billing settlement requires review. Credits remain reserved.",
        outputPayload: usage
          ? { content, usage, settlementPending: true }
          : { content, usageEstimated: true, settlementPending: true },
      },
    });
  }
}

/**
 * Idempotently project a terminal TEXT job into Character Chat.
 *
 * Projection is deliberately separate from provider settlement: deleting a
 * thread or a transient chat write failure must never roll back billing. The
 * worker invokes this after every processing attempt, so a retry replays only
 * this idempotent side effect once the generation job is already terminal.
 */
export async function projectTextJobToChat(id: string): Promise<void> {
  const job = await db.generationJob.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      chatThreadId: true,
      idempotencyKey: true,
      requestPayload: true,
      outputPayload: true,
      chargedCredits: true,
      errorCode: true,
    },
  });
  if (
    !job ||
    !job.chatThreadId ||
    !["SUCCEEDED", "FAILED", "CANCELLED", "MANUAL_REVIEW"].includes(job.status)
  ) {
    return;
  }

  const requestPayload = payloadObject(job.requestPayload);
  const outputPayload = payloadObject(job.outputPayload);
  const successfulContent =
    typeof outputPayload.content === "string" ? outputPayload.content : null;
  if (job.status === "SUCCEEDED" && !successfulContent) return;

  const content =
    job.status === "SUCCEEDED"
      ? successfulContent!
      : job.status === "CANCELLED"
        ? "Generation was cancelled. You can retry this message."
        : job.status === "MANUAL_REVIEW"
          ? "Generation needs review before it can be retried safely."
          : "Generation failed. You can retry this message.";

  const clientRequestId =
    typeof requestPayload.clientRequestId === "string"
      ? requestPayload.clientRequestId
      : job.idempotencyKey;
  const rawUsage = payloadObject(outputPayload.usage);
  const usage =
    job.status === "SUCCEEDED" &&
    Number.isSafeInteger(rawUsage.promptTokens) &&
    Number.isSafeInteger(rawUsage.completionTokens) &&
    Number.isSafeInteger(rawUsage.totalTokens)
      ? {
          promptTokens: Number(rawUsage.promptTokens),
          completionTokens: Number(rawUsage.completionTokens),
          totalTokens: Number(rawUsage.totalTokens),
        }
      : undefined;

  await db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM ChatThread WHERE id = ${job.chatThreadId} FOR UPDATE
    `;
    if (locked.length === 0) return;

    const existing = await tx.chatMessage.findUnique({
      where: {
        threadId_clientRequestId_role: {
          threadId: job.chatThreadId!,
          clientRequestId,
          role: "assistant",
        },
      },
    });
    const existingMetadata = payloadObject(existing?.metadata);
    const metadata = {
      ...existingMetadata,
      generationJobId: id,
      generationStatus: job.status,
      chargedCredits: Number(job.chargedCredits),
      ...(job.errorCode ? { errorCode: job.errorCode } : {}),
      ...(usage ? { usage } : {}),
    };

    if (existing) {
      await tx.chatMessage.update({
        where: { id: existing.id },
        data: {
          content,
          tokensUsed: usage?.totalTokens ?? null,
          metadata,
        },
      });
    } else {
      await tx.chatMessage.create({
        data: {
          threadId: job.chatThreadId!,
          clientRequestId,
          role: "assistant",
          content,
          tokensUsed: usage?.totalTokens ?? null,
          metadata,
        },
      });
    }
    await tx.chatThread.update({
      where: { id: job.chatThreadId! },
      data: { updatedAt: new Date() },
    });
  });
}

/**
 * Best-effort read repair for terminal text jobs. Worker completion is the
 * canonical projection path; this bounded reconciliation only repairs a recent
 * missed side effect and callers must treat failure as non-fatal.
 */
export async function reconcileTextChatThread(
  threadId: string,
  limit = 50,
): Promise<void> {
  const jobs = await db.generationJob.findMany({
    where: {
      chatThreadId: threadId,
      status: { in: ["SUCCEEDED", "FAILED", "CANCELLED", "MANUAL_REVIEW"] },
      providerModel: { mediaKind: "TEXT" },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(1, limit), 100),
    select: { id: true },
  });
  for (const job of jobs) {
    await projectTextJobToChat(job.id);
  }
}

/**
 * Compatibility helper for tests and trusted server callers. Product HTTP
 * routes use createTextJob and let the generation worker execute the provider.
 */
export async function executeTextGeneration(
  userId: string,
  raw: unknown,
  options?: TextGenerationOptions,
): Promise<TextGenerationResult> {
  const job = await createTextJob(userId, raw);
  const replay = textResultFromJob(job);
  if (replay) return replay;
  if (job.status !== "QUEUED")
    throw new GenerationError(
      "This generation request is already being processed.",
      409,
    );

  const provider =
    options?.provider ??
    createBytePlusProvider({
      apiKey: process.env.BYTEPLUS_API_KEY,
      region:
        (process.env.BYTEPLUS_REGION as "ap-southeast-1" | "eu-west-1") ??
        "ap-southeast-1",
      modelArkBaseUrl: process.env.BYTEPLUS_MODELARK_BASE_URL,
    });
  await processTextJob(job.id, provider);
  await projectTextJobToChat(job.id);
  const completed = await db.generationJob.findUniqueOrThrow({
    where: { id: job.id },
  });
  const result = textResultFromJob(completed);
  if (!result)
    throw new GenerationError("Text generation is still being processed.", 409);
  return result;
}
