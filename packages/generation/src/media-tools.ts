import { createHash } from "node:crypto";

import { hasOrganizationPermission } from "@aiwa/authz";
import {
  captureCreditsForReference,
  quoteProviderToolPrice,
  releaseCreditsForReference,
  reserveCreditsForReference,
} from "@aiwa/credits";
import { db, type Prisma } from "@aiwa/db";
import { muscatCalendarMonth } from "@aiwa/organizations";
import {
  ProviderRequestError,
  type MediaToolProvider,
  type ProviderToolTask,
} from "@aiwa/providers";
import { z } from "zod";

const REFERENCE_TYPE = "PROVIDER_TOOL_EXECUTION";
const MAX_ACTIVE_PER_USER = 5;
const MAX_ACTIVE_PER_ORG = 20;

export class ProviderToolExecutionError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "ProviderToolExecutionError";
  }
}

export const providerToolExecutionRequestSchema = z
  .object({
    organizationId: z.string().min(1).max(128),
    toolId: z.string().min(1).max(128),
    priceVersionId: z.string().min(1).max(128),
    idempotencyKey: z.uuid(),
    quotedQuantity: z.number().int().min(1).max(86_400),
    input: z.record(z.string(), z.unknown()),
  })
  .strict();

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

export function providerToolRequestHash(input: {
  toolId: string;
  priceVersionId: string;
  quotedQuantity: number;
  payload: Readonly<Record<string, unknown>>;
}): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(input)))
    .digest("hex");
}

function executionKey(
  organizationId: string,
  userId: string,
  idempotencyKey: string,
): string {
  return createHash("sha256")
    .update(`${organizationId}:${userId}:${idempotencyKey}`)
    .digest("hex");
}

function priceQuote(
  price: {
    providerCostMicroUsd: bigint;
    pricingMetric: "REQUEST" | "INPUT_SECOND" | "OUTPUT_SECOND";
    unitQuantity: number;
    fxBaisaNumerator: bigint;
    fxBaisaDenominator: bigint;
    targetMarginBps: number;
    creditsPerBaisa: bigint;
  },
  quantity: number,
) {
  return quoteProviderToolPrice({
    providerCostMicroUsd: price.providerCostMicroUsd,
    pricingMetric: price.pricingMetric,
    unitQuantity: price.unitQuantity,
    billableQuantity: quantity,
    exchangeRate: {
      baisaNumerator: price.fxBaisaNumerator,
      baisaDenominator: price.fxBaisaDenominator,
    },
    targetGrossMarginBps: price.targetMarginBps,
    creditsPerBaisa: price.creditsPerBaisa,
  });
}

async function requireToolMembership(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
) {
  const member = await tx.membership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: { organization: true, user: true },
  });
  if (
    !member ||
    member.user.disabledAt ||
    member.user.emailVerified !== true ||
    member.organization.status !== "ACTIVE" ||
    !hasOrganizationPermission(member.role, "generation:create")
  ) {
    throw new ProviderToolExecutionError("Workspace access denied.", 403);
  }
  return member;
}

async function assertToolAdmission(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM User WHERE id = ${userId} FOR UPDATE`;
  const active = [
    "QUEUED",
    "SUBMITTING",
    "PROCESSING",
    "MANUAL_REVIEW",
  ] as const;
  const [userActive, orgActive] = await Promise.all([
    tx.providerToolExecution.count({
      where: { createdById: userId, status: { in: [...active] } },
    }),
    tx.providerToolExecution.count({
      where: { organizationId, status: { in: [...active] } },
    }),
  ]);
  if (userActive >= MAX_ACTIVE_PER_USER) {
    throw new ProviderToolExecutionError(
      "Provider-tool concurrency limit reached.",
      429,
    );
  }
  if (orgActive >= MAX_ACTIVE_PER_ORG) {
    throw new ProviderToolExecutionError(
      "Workspace provider-tool concurrency limit reached.",
      429,
    );
  }
}

async function assertToolSpendingCap(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string;
    userId: string;
    cap: bigint | null;
    additionalCredits: bigint;
    now: Date;
  },
): Promise<void> {
  if (params.cap === null) return;
  const { start, end } = muscatCalendarMonth(params.now);
  const [generationDone, generationActive, toolDone, toolActive] =
    await Promise.all([
      tx.generationJob.aggregate({
        where: {
          organizationId: params.organizationId,
          createdById: params.userId,
          createdAt: { gte: start, lt: end },
          status: "SUCCEEDED",
        },
        _sum: { chargedCredits: true },
      }),
      tx.generationJob.aggregate({
        where: {
          organizationId: params.organizationId,
          createdById: params.userId,
          createdAt: { gte: start, lt: end },
          status: { notIn: ["CANCELLED", "FAILED", "DRAFT", "SUCCEEDED"] },
        },
        _sum: { reservedCredits: true },
      }),
      tx.providerToolExecution.aggregate({
        where: {
          organizationId: params.organizationId,
          createdById: params.userId,
          createdAt: { gte: start, lt: end },
          status: "SUCCEEDED",
        },
        _sum: { chargedCredits: true },
      }),
      tx.providerToolExecution.aggregate({
        where: {
          organizationId: params.organizationId,
          createdById: params.userId,
          createdAt: { gte: start, lt: end },
          status: {
            in: ["QUEUED", "SUBMITTING", "PROCESSING", "MANUAL_REVIEW"],
          },
        },
        _sum: { reservedCredits: true },
      }),
    ]);
  const committed =
    (generationDone._sum.chargedCredits ?? 0n) +
    (generationActive._sum.reservedCredits ?? 0n) +
    (toolDone._sum.chargedCredits ?? 0n) +
    (toolActive._sum.reservedCredits ?? 0n);
  if (committed + params.additionalCredits > params.cap) {
    throw new ProviderToolExecutionError("Monthly spending cap exceeded.", 409);
  }
}

export async function createProviderToolExecution(
  userId: string,
  raw: unknown,
) {
  const input = providerToolExecutionRequestSchema.parse(raw);
  const key = executionKey(input.organizationId, userId, input.idempotencyKey);
  const requestHash = providerToolRequestHash({
    toolId: input.toolId,
    priceVersionId: input.priceVersionId,
    quotedQuantity: input.quotedQuantity,
    payload: input.input,
  });

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM Organization WHERE id = ${input.organizationId} FOR UPDATE`;
    const member = await requireToolMembership(
      tx,
      input.organizationId,
      userId,
    );
    const existing = await tx.providerToolExecution.findUnique({
      where: { idempotencyKey: key },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ProviderToolExecutionError(
          "Request key was already used for different tool inputs.",
          409,
        );
      }
      return existing;
    }

    await assertToolAdmission(tx, input.organizationId, userId);
    const now = new Date();
    const tool = await tx.providerTool.findFirst({
      where: { id: input.toolId, provider: "BYTEPLUS", enabled: true },
      include: {
        priceVersions: {
          where: {
            id: input.priceVersionId,
            effectiveFrom: { lte: now },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
          },
          take: 1,
        },
      },
    });
    const price = tool?.priceVersions[0];
    if (!tool || !price || price.pricingMetric !== tool.pricingMetric) {
      throw new ProviderToolExecutionError(
        "Tool or price changed. Refresh and try again.",
        409,
      );
    }
    const quote = priceQuote(price, input.quotedQuantity);
    await assertToolSpendingCap(tx, {
      organizationId: input.organizationId,
      userId,
      cap: member.monthlySpendingCapCredits,
      additionalCredits: quote.customerCredits,
      now,
    });
    const wallet = await tx.wallet.findUnique({
      where: { organizationId: input.organizationId },
    });
    if (!wallet)
      throw new ProviderToolExecutionError(
        "Workspace wallet is unavailable.",
        409,
      );

    const execution = await tx.providerToolExecution.create({
      data: {
        organizationId: input.organizationId,
        createdById: userId,
        providerToolId: tool.id,
        priceVersionId: price.id,
        idempotencyKey: key,
        requestHash,
        requestPayload: input.input as Prisma.InputJsonValue,
        quotedQuantity: input.quotedQuantity,
        reservedCredits: quote.customerCredits,
        status: "QUEUED",
      },
    });
    await reserveCreditsForReference(tx, {
      walletId: wallet.id,
      amountCredits: quote.customerCredits,
      idempotencyKey: `provider-tool-reserve-${execution.id}`,
      referenceType: REFERENCE_TYPE,
      referenceId: execution.id,
      description: `Reservation for provider tool execution ${execution.id}`,
      metadata: { providerToolId: tool.id, priceVersionId: price.id },
    });
    await tx.auditEvent.create({
      data: {
        actorUserId: userId,
        organizationId: input.organizationId,
        action: "provider_tool.execution_queued",
        targetType: "ProviderToolExecution",
        targetId: execution.id,
        requestId: input.idempotencyKey,
        metadata: {
          providerToolId: tool.id,
          providerToolKey: tool.providerToolId,
          quotedQuantity: input.quotedQuantity,
          reservedCredits: quote.customerCredits.toString(),
        },
      },
    });
    return execution;
  });
}

function retryAt(retryCount: number): Date {
  const delayMs = Math.min(300_000, 5_000 * 2 ** Math.min(retryCount, 6));
  return new Date(Date.now() + delayMs);
}

async function markRetryable(
  executionId: string,
  expected: "SUBMITTING" | "PROCESSING",
  error: ProviderRequestError,
): Promise<void> {
  const current = await db.providerToolExecution.findUnique({
    where: { id: executionId },
    select: { retryCount: true, maxAttempts: true },
  });
  if (!current) return;
  const next = current.retryCount + 1;
  await db.providerToolExecution.updateMany({
    where: { id: executionId, status: expected },
    data:
      next >= current.maxAttempts
        ? {
            status: "MANUAL_REVIEW",
            retryCount: next,
            nextAttemptAt: null,
            errorCode: error.code ?? "PROVIDER_RETRY_EXHAUSTED",
            errorMessage:
              "Provider recovery attempts were exhausted. Credits remain reserved for operator review.",
          }
        : {
            status: expected === "SUBMITTING" ? "QUEUED" : "PROCESSING",
            retryCount: next,
            nextAttemptAt: retryAt(next),
            errorCode: error.code ?? "PROVIDER_TEMPORARY_ERROR",
            errorMessage:
              "Provider operation is temporarily unavailable; durable recovery will retry.",
          },
  });
}

async function releaseTerminal(
  executionId: string,
  status: "FAILED" | "CANCELLED",
  code: string,
  message: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM ProviderToolExecution WHERE id = ${executionId} FOR UPDATE`;
    const execution = await tx.providerToolExecution.findUnique({
      where: { id: executionId },
    });
    if (
      !execution ||
      ["FAILED", "CANCELLED", "SUCCEEDED"].includes(execution.status)
    )
      return;
    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { organizationId: execution.organizationId },
    });
    await releaseCreditsForReference(tx, {
      walletId: wallet.id,
      amountCredits: execution.reservedCredits,
      idempotencyKey: `provider-tool-release-${execution.id}`,
      referenceType: REFERENCE_TYPE,
      referenceId: execution.id,
      description: message,
      metadata: { errorCode: code },
    });
    await tx.providerToolExecution.update({
      where: { id: execution.id },
      data: {
        status,
        reservedCredits: 0n,
        errorCode: code,
        errorMessage: message,
        nextAttemptAt: null,
        completedAt: new Date(),
      },
    });
    await tx.auditEvent.create({
      data: {
        actorUserId: execution.createdById,
        organizationId: execution.organizationId,
        action:
          status === "FAILED"
            ? "provider_tool.failed"
            : "provider_tool.cancelled",
        targetType: "ProviderToolExecution",
        targetId: execution.id,
        metadata: { errorCode: code },
      },
    });
  });
}

export function providerToolActualQuantity(
  pricingMetric: "REQUEST" | "INPUT_SECOND" | "OUTPUT_SECOND",
  result: Readonly<Record<string, unknown>> | undefined,
): number | null {
  if (pricingMetric === "REQUEST") return 1;
  const raw = result?.duration;
  const duration =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && /^\d+(?:\.\d+)?$/.test(raw)
        ? Number(raw)
        : Number.NaN;
  if (!Number.isFinite(duration) || duration <= 0 || duration > 86_400)
    return null;
  return Math.ceil(duration);
}

async function settleSucceeded(
  executionId: string,
  result: ProviderToolTask,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM ProviderToolExecution WHERE id = ${executionId} FOR UPDATE`;
    const execution = await tx.providerToolExecution.findUnique({
      where: { id: executionId },
      include: { providerTool: true, priceVersion: true },
    });
    if (!execution || execution.status === "SUCCEEDED") return;
    if (!["SUBMITTING", "PROCESSING"].includes(execution.status)) return;

    const actualQuantity = providerToolActualQuantity(
      execution.priceVersion.pricingMetric,
      result.result,
    );
    if (actualQuantity === null) {
      await tx.providerToolExecution.update({
        where: { id: execution.id },
        data: {
          status: "MANUAL_REVIEW",
          nextAttemptAt: null,
          errorCode: "MISSING_PROVIDER_USAGE",
          errorMessage:
            "Provider succeeded without authoritative billable usage. Credits remain reserved for operator review.",
          resultPayload: (result.result ?? {}) as Prisma.InputJsonValue,
        },
      });
      return;
    }
    const quote = priceQuote(execution.priceVersion, actualQuantity);
    if (quote.customerCredits > execution.reservedCredits) {
      await tx.providerToolExecution.update({
        where: { id: execution.id },
        data: {
          status: "MANUAL_REVIEW",
          actualQuantity,
          actualProviderCostMicroUsd: quote.providerCostMicroUsd,
          nextAttemptAt: null,
          errorCode: "ACTUAL_COST_EXCEEDS_RESERVATION",
          errorMessage:
            "Provider usage exceeded the pre-authorized reservation. No extra credits were captured automatically.",
          resultPayload: (result.result ?? {}) as Prisma.InputJsonValue,
        },
      });
      return;
    }

    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { organizationId: execution.organizationId },
    });
    await captureCreditsForReference(tx, {
      walletId: wallet.id,
      amountCredits: quote.customerCredits,
      idempotencyKey: `provider-tool-capture-${execution.id}`,
      referenceType: REFERENCE_TYPE,
      referenceId: execution.id,
      description: `Capture for provider tool execution ${execution.id}`,
      metadata: {
        pricingMetric: execution.priceVersion.pricingMetric,
        actualQuantity,
        billableUnits: quote.billableUnits.toString(),
      },
    });
    await tx.providerToolExecution.update({
      where: { id: execution.id },
      data: {
        status: "SUCCEEDED",
        resultPayload: (result.result ?? {}) as Prisma.InputJsonValue,
        actualQuantity,
        chargedCredits: quote.customerCredits,
        reservedCredits: quote.customerCredits,
        actualProviderCostMicroUsd: quote.providerCostMicroUsd,
        retryCount: 0,
        nextAttemptAt: null,
        errorCode: null,
        errorMessage: null,
        completedAt: new Date(),
      },
    });
    await tx.auditEvent.create({
      data: {
        actorUserId: execution.createdById,
        organizationId: execution.organizationId,
        action: "provider_tool.succeeded",
        targetType: "ProviderToolExecution",
        targetId: execution.id,
        metadata: {
          providerToolId: execution.providerToolId,
          pricingMetric: execution.priceVersion.pricingMetric,
          actualQuantity,
          chargedCredits: quote.customerCredits.toString(),
        },
      },
    });
  });
}

export async function processProviderToolExecution(
  executionId: string,
  provider: MediaToolProvider,
): Promise<void> {
  let execution = await db.providerToolExecution.findUnique({
    where: { id: executionId },
    include: { providerTool: true, priceVersion: true },
  });
  if (!execution) return;

  if (execution.status === "QUEUED") {
    if (!execution.providerTool.enabled) {
      if (execution.retryCount === 0) {
        await releaseTerminal(
          execution.id,
          "FAILED",
          "TOOL_DISABLED",
          "Tool was disabled before provider submission. Credits released.",
        );
      } else {
        await db.providerToolExecution.updateMany({
          where: { id: execution.id, status: "QUEUED" },
          data: {
            status: "MANUAL_REVIEW",
            nextAttemptAt: null,
            errorCode: "TOOL_DISABLED_DURING_RECOVERY",
            errorMessage:
              "Tool was disabled during provider recovery. Credits remain reserved for review.",
          },
        });
      }
      return;
    }
    const claimed = await db.providerToolExecution.updateMany({
      where: { id: execution.id, status: "QUEUED" },
      data: {
        status: "SUBMITTING",
        submittedAt: execution.submittedAt ?? new Date(),
      },
    });
    if (!claimed.count) return;
    execution = await db.providerToolExecution.findUniqueOrThrow({
      where: { id: execution.id },
      include: { providerTool: true, priceVersion: true },
    });
  }

  if (execution.status === "SUBMITTING") {
    let submitted: ProviderToolTask;
    try {
      submitted = await provider.submit({
        idempotencyKey: execution.idempotencyKey,
        toolId: execution.providerTool.providerToolId,
        input: execution.requestPayload as Record<string, unknown>,
      });
    } catch (error) {
      if (error instanceof ProviderRequestError && error.retryable) {
        await markRetryable(execution.id, "SUBMITTING", error);
        return;
      }
      if (error instanceof ProviderRequestError) {
        await releaseTerminal(
          execution.id,
          "FAILED",
          error.code ?? "PROVIDER_REJECTED",
          "Provider rejected the tool request. Credits released.",
        );
        return;
      }
      await db.providerToolExecution.updateMany({
        where: { id: execution.id, status: "SUBMITTING" },
        data: {
          status: "MANUAL_REVIEW",
          nextAttemptAt: null,
          errorCode: "UNEXPECTED_SUBMISSION_ERROR",
          errorMessage:
            "Submission outcome could not be classified. Credits remain reserved for review.",
        },
      });
      return;
    }

    if (submitted.status === "failed" || submitted.status === "cancelled") {
      await releaseTerminal(
        execution.id,
        submitted.status === "cancelled" ? "CANCELLED" : "FAILED",
        submitted.errorCode ?? "PROVIDER_REJECTED",
        "Provider did not complete the tool request. Credits released.",
      );
      return;
    }
    if (submitted.status === "succeeded") {
      await settleSucceeded(execution.id, submitted);
      return;
    }
    if (!submitted.providerTaskId) {
      await db.providerToolExecution.updateMany({
        where: { id: execution.id, status: "SUBMITTING" },
        data: {
          status: "MANUAL_REVIEW",
          nextAttemptAt: null,
          errorCode: "MISSING_PROVIDER_TASK_ID",
          errorMessage:
            "Provider accepted work without a recoverable task identifier. Credits remain reserved for review.",
        },
      });
      return;
    }
    await db.providerToolExecution.updateMany({
      where: { id: execution.id, status: "SUBMITTING" },
      data: {
        status: "PROCESSING",
        providerTaskId: submitted.providerTaskId,
        providerRequestId: submitted.providerRequestId,
        retryCount: 0,
        nextAttemptAt: retryAt(0),
        errorCode: null,
        errorMessage: null,
      },
    });
    return;
  }

  if (execution.status !== "PROCESSING" || !execution.providerTaskId) return;

  let polled: ProviderToolTask;
  try {
    polled = await provider.getTask(execution.providerTaskId);
  } catch (error) {
    if (error instanceof ProviderRequestError && error.retryable) {
      await markRetryable(execution.id, "PROCESSING", error);
      return;
    }
    await db.providerToolExecution.updateMany({
      where: { id: execution.id, status: "PROCESSING" },
      data: {
        status: "MANUAL_REVIEW",
        nextAttemptAt: null,
        errorCode:
          error instanceof ProviderRequestError
            ? (error.code ?? "PROVIDER_POLL_FAILED")
            : "UNEXPECTED_POLL_ERROR",
        errorMessage:
          "Provider task status is no longer safely recoverable. Credits remain reserved for operator review.",
      },
    });
    return;
  }

  if (polled.status === "submitted" || polled.status === "processing") {
    await db.providerToolExecution.updateMany({
      where: { id: execution.id, status: "PROCESSING" },
      data: {
        retryCount: 0,
        nextAttemptAt: retryAt(0),
        errorCode: null,
        errorMessage: null,
      },
    });
    return;
  }
  if (polled.status === "failed" || polled.status === "cancelled") {
    await releaseTerminal(
      execution.id,
      polled.status === "cancelled" ? "CANCELLED" : "FAILED",
      polled.errorCode ??
        (polled.status === "cancelled"
          ? "PROVIDER_CANCELLED"
          : "PROVIDER_FAILED"),
      "Provider did not complete the tool request. Credits released.",
    );
    return;
  }
  await settleSucceeded(execution.id, polled);
}
