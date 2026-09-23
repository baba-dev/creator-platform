import { createHash } from "node:crypto";
import { captureCreditsForJob, releaseOrRefundCredits } from "@aiwa/credits";
import { db, type Prisma } from "@aiwa/db";
import { parseServerEnv } from "@aiwa/config";
import { type MediaGenerationProvider } from "@aiwa/providers";
import { createBytePlusProvider } from "@aiwa/providers/byteplus";
import {
  deleteStoredAsset,
  downloadImage,
  downloadVideo,
  readStoredAsset,
  storeImage,
  storeVideo,
  validateMp3Bytes,
} from "./storage";

export class JobReconciliationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "JobReconciliationError";
  }
}

type ReconciliationOutcome =
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "NOT_SUBMITTED";

function metadataObject(metadata: unknown): Record<string, unknown> {
  return typeof metadata === "object" &&
    metadata !== null &&
    !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

function resolutionHash(value: Record<string, unknown>): string {
  return createHash("sha256")
    .update(
      JSON.stringify(value, (_key, item) =>
        typeof item === "bigint" ? item.toString() : item,
      ),
    )
    .digest("hex");
}

async function findResolutionAudit(
  tx: Prisma.TransactionClient,
  jobId: string,
  idempotencyKey: string,
) {
  const events = await tx.auditEvent.findMany({
    where: {
      targetType: "GenerationJob",
      targetId: jobId,
      action: { startsWith: "generation." },
    },
    orderBy: { createdAt: "desc" },
  });
  return (
    events.find(
      (event) =>
        metadataObject(event.metadata).idempotencyKey === idempotencyKey,
    ) ?? null
  );
}

function replayResult(
  existing: Awaited<ReturnType<typeof findResolutionAudit>>,
  expectedAction: string,
  expectedHash: string,
  message: string,
) {
  if (!existing) return null;
  const metadata = metadataObject(existing.metadata);
  if (
    existing.action !== expectedAction ||
    metadata.requestHash !== expectedHash
  ) {
    throw new JobReconciliationError(
      "IDEMPOTENCY_CONFLICT",
      "This idempotency key was already used for a different administrative resolution.",
      409,
    );
  }
  return { success: true, message };
}

async function latestReconciledOutcome(
  tx: Prisma.TransactionClient,
  jobId: string,
): Promise<ReconciliationOutcome | null> {
  const events = await tx.auditEvent.findMany({
    where: {
      targetType: "GenerationJob",
      targetId: jobId,
      action: "generation.reconciled",
    },
    orderBy: { createdAt: "desc" },
  });
  for (const event of events) {
    const outcome = metadataObject(event.metadata).outcome;
    if (
      outcome === "SUCCEEDED" ||
      outcome === "FAILED" ||
      outcome === "CANCELLED" ||
      outcome === "NOT_SUBMITTED"
    ) {
      return outcome;
    }
  }
  return null;
}

function latestOutcomeFromAudits(
  events: Array<{ action: string; metadata: unknown }>,
): ReconciliationOutcome | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.action !== "generation.reconciled") continue;
    const outcome = metadataObject(event.metadata).outcome;
    if (
      outcome === "SUCCEEDED" ||
      outcome === "FAILED" ||
      outcome === "CANCELLED" ||
      outcome === "NOT_SUBMITTED"
    ) {
      return outcome;
    }
  }
  return null;
}

function assertManualReview(jobStatus: string) {
  if (jobStatus !== "MANUAL_REVIEW") {
    throw new JobReconciliationError(
      "INVALID_STATE",
      "Administrative reconciliation is only permitted for jobs in MANUAL_REVIEW.",
      409,
    );
  }
}

export interface JobPermittedActions {
  canReconcile: boolean;
  reconcileReason?: string;
  canRecover: boolean;
  recoverReason?: string;
  canRelease: boolean;
  releaseReason?: string;
  canRefund: boolean;
  refundReason?: string;
}

export interface ReconcileProviderOutcomeParams {
  jobId: string;
  actorUserId: string;
  outcome: ReconciliationOutcome;
  evidence: string;
  providerRequestId?: string;
  actualProviderCostMicroUsd?: bigint;
  notes?: string;
  idempotencyKey: string;
}

export interface RecoverGeneratedOutputParams {
  jobId: string;
  actorUserId: string;
  reason: string;
  outputUrl?: string;
  mode?: "immediate" | "resume_processing";
  idempotencyKey: string;
  provider?: MediaGenerationProvider | null;
}

export interface ReleaseJobReservationParams {
  jobId: string;
  actorUserId: string;
  reason: string;
  evidence: string;
  idempotencyKey: string;
}

export interface RefundSettledJobParams {
  jobId: string;
  actorUserId: string;
  reason: string;
  amountCredits?: bigint;
  idempotencyKey: string;
}

export function getDefaultGenerationProvider(): MediaGenerationProvider | null {
  try {
    const env = parseServerEnv();
    const hasBytePlus = Boolean(
      env.BYTEPLUS_API_KEY || env.BYTEPLUS_SPEECH_API_KEY,
    );
    if (!hasBytePlus) return null;
    return createBytePlusProvider({
      apiKey: env.BYTEPLUS_API_KEY,
      region: env.BYTEPLUS_REGION,
      modelArkBaseUrl: env.BYTEPLUS_MODELARK_BASE_URL,
      speechBaseUrl: env.BYTEPLUS_SPEECH_BASE_URL,
      speechApiKey: env.BYTEPLUS_SPEECH_API_KEY,
      speechAppKey: env.BYTEPLUS_SPEECH_APP_KEY,
      requestTimeoutMs: env.BYTEPLUS_REQUEST_TIMEOUT_MS,
      idleTimeoutMs: env.BYTEPLUS_IDLE_TIMEOUT_MS,
    });
  } catch {
    return null;
  }
}

export async function getJobReconciliationDetails(jobId: string) {
  const job = await db.generationJob.findUnique({
    where: { id: jobId },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          wallet: {
            select: {
              id: true,
              balanceCache: true,
            },
          },
        },
      },
      project: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      providerModel: {
        select: {
          id: true,
          displayName: true,
          providerModelId: true,
          provider: true,
          mediaKind: true,
        },
      },
      priceVersion: {
        select: {
          id: true,
          providerCostMicroUsd: true,
          customerCredits: true,
          targetMarginBps: true,
          pricingDimension: true,
          unitQuantity: true,
        },
      },
      assets: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          objectKey: true,
          status: true,
          mimeType: true,
          byteSize: true,
          sha256: true,
          width: true,
          height: true,
          durationMs: true,
          createdAt: true,
        },
      },
    },
  });

  if (!job) return null;

  const [ledgerEntries, auditEvents] = await Promise.all([
    db.ledgerEntry.findMany({
      where: {
        referenceType: "GENERATION_JOB",
        referenceId: jobId,
      },
      include: {
        reversalOf: {
          select: { id: true, type: true, amountCredits: true },
        },
        reversedBy: {
          select: { id: true, type: true, amountCredits: true },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.auditEvent.findMany({
      where: {
        targetType: "GenerationJob",
        targetId: jobId,
      },
      include: {
        actor: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const captureEntry = ledgerEntries.find((e) => e.type === "CAPTURE");
  const refundEntry = ledgerEntries.find((e) => e.type === "REFUND");
  const releaseEntry = ledgerEntries.find((e) => e.type === "RELEASE");
  const reconciliationOutcome = latestOutcomeFromAudits(auditEvents);

  // Calculate permitted actions
  const permittedActions: JobPermittedActions = {
    canReconcile: job.status === "MANUAL_REVIEW",
    canRecover: false,
    canRelease: false,
    canRefund: false,
  };

  permittedActions.reconcileReason =
    job.status === "MANUAL_REVIEW"
      ? "Record a verified provider outcome before resolving held credits or resuming recovery."
      : "Provider reconciliation is reserved for jobs in MANUAL_REVIEW.";

  const releaseOutcomeVerified =
    reconciliationOutcome === "FAILED" ||
    reconciliationOutcome === "CANCELLED" ||
    reconciliationOutcome === "NOT_SUBMITTED";

  if (
    job.status === "MANUAL_REVIEW" &&
    releaseOutcomeVerified &&
    job.reservedCredits > 0n &&
    job.chargedCredits === 0n &&
    !captureEntry &&
    !releaseEntry
  ) {
    permittedActions.canRelease = true;
    permittedActions.releaseReason =
      "Provider reconciliation confirms no successful billable output; the held reservation can be released.";
  } else if (job.status !== "MANUAL_REVIEW") {
    permittedActions.releaseReason =
      "Reservation release is only available while a job is in MANUAL_REVIEW.";
  } else if (!releaseOutcomeVerified) {
    permittedActions.releaseReason =
      "Reconcile the provider outcome as FAILED, CANCELLED, or NOT_SUBMITTED before releasing credits.";
  } else if (job.chargedCredits > 0n || captureEntry) {
    permittedActions.releaseReason =
      "Credits have already been captured. Use Refund instead.";
  } else if (releaseEntry) {
    permittedActions.releaseReason = "Reservation has already been released.";
  } else {
    permittedActions.releaseReason = "No active credit reservation remains.";
  }

  const processingRecovery =
    job.status === "PROCESSING" &&
    job.assets.some((asset) => asset.status === "PENDING");
  const manualRecovery =
    job.status === "MANUAL_REVIEW" &&
    reconciliationOutcome === "SUCCEEDED";

  if (processingRecovery || manualRecovery) {
    permittedActions.canRecover = true;
    permittedActions.recoverReason =
      job.providerModel.mediaKind === "VOICE"
        ? "Provider success is verified. Recovery only finalizes an already-stored valid MP3 and never resubmits synthesis."
        : "Existing generated output can be finalized without a new provider submission.";
  } else if (job.status === "MANUAL_REVIEW") {
    permittedActions.recoverReason =
      "Reconcile the provider outcome as SUCCEEDED before recovering output.";
  } else if (job.status === "SUCCEEDED") {
    permittedActions.recoverReason =
      "Job output has already been successfully stored.";
  } else {
    permittedActions.recoverReason =
      "Recovery is available only for verified MANUAL_REVIEW jobs or PROCESSING storage recovery.";
  }

  // Refund permitted if job is settled (chargedCredits > 0) and unrefunded
  if (
    job.chargedCredits > 0n &&
    captureEntry &&
    !captureEntry.reversedBy &&
    !refundEntry
  ) {
    permittedActions.canRefund = true;
    permittedActions.refundReason =
      "Settled job can be refunded with documented administrative reason.";
  } else if (!captureEntry || job.chargedCredits === 0n) {
    permittedActions.canRefund = false;
    permittedActions.refundReason =
      "Job has not charged any credits to refund.";
  } else if (captureEntry.reversedBy || refundEntry) {
    permittedActions.canRefund = false;
    permittedActions.refundReason =
      "Captured credits have already been refunded.";
  }

  return {
    job,
    ledgerEntries,
    auditEvents,
    permittedActions,
  };
}

export async function reconcileProviderOutcome(
  params: ReconcileProviderOutcomeParams,
) {
  const requestHash = resolutionHash({
    action: "reconcile",
    outcome: params.outcome,
    evidence: params.evidence,
    providerRequestId: params.providerRequestId ?? null,
    actualProviderCostMicroUsd:
      params.actualProviderCostMicroUsd?.toString() ?? null,
    notes: params.notes ?? null,
  });

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM GenerationJob WHERE id = ${params.jobId} FOR UPDATE`;
    const job = await tx.generationJob.findUnique({
      where: { id: params.jobId },
      include: { organization: true },
    });

    if (!job) {
      throw new JobReconciliationError(
        "JOB_NOT_FOUND",
        `Job '${params.jobId}' was not found.`,
        404,
      );
    }

    const existingAudits = await tx.auditEvent.findMany({
      where: {
        targetType: "GenerationJob",
        targetId: params.jobId,
        action: "generation.reconciled",
      },
    });

    const existingAudit = existingAudits.find(
      (e) =>
        typeof e.metadata === "object" &&
        e.metadata !== null &&
        (e.metadata as Record<string, unknown>).idempotencyKey ===
          params.idempotencyKey,
    );

    if (existingAudit) {
      const metadata = metadataObject(existingAudit.metadata);
      if (metadata.requestHash !== requestHash) {
        throw new JobReconciliationError(
          "IDEMPOTENCY_CONFLICT",
          "This idempotency key was already used with different reconciliation evidence.",
          409,
        );
      }
      return { success: true, message: "Reconciliation already recorded." };
    }

    assertManualReview(job.status);

    if (
      params.providerRequestId &&
      job.providerRequestId &&
      params.providerRequestId !== job.providerRequestId
    ) {
      throw new JobReconciliationError(
        "PROVIDER_REQUEST_ID_CONFLICT",
        "The supplied provider request ID conflicts with the request ID already recorded for this job.",
        409,
      );
    }

    const updateData: Prisma.GenerationJobUpdateInput = {};
    if (params.providerRequestId && !job.providerRequestId) {
      updateData.providerRequestId = params.providerRequestId;
    }
    if (params.actualProviderCostMicroUsd !== undefined) {
      updateData.actualProviderCostMicroUsd = params.actualProviderCostMicroUsd;
    }
    if (
      job.status === "MANUAL_REVIEW" &&
      (params.outcome === "FAILED" ||
        params.outcome === "CANCELLED" ||
        params.outcome === "NOT_SUBMITTED")
    ) {
      updateData.errorCode =
        params.outcome === "FAILED"
          ? "PROVIDER_CONFIRMED_FAILED"
          : params.outcome === "CANCELLED"
            ? "PROVIDER_CONFIRMED_CANCELLED"
            : "PROVIDER_NOT_SUBMITTED";
      updateData.errorMessage = params.evidence;
    }

    if (Object.keys(updateData).length > 0) {
      await tx.generationJob.update({
        where: { id: params.jobId },
        data: updateData,
      });
    }

    await tx.auditEvent.create({
      data: {
        actorUserId: params.actorUserId,
        organizationId: job.organizationId,
        action: "generation.reconciled",
        targetType: "GenerationJob",
        targetId: params.jobId,
        metadata: {
          outcome: params.outcome,
          evidence: params.evidence,
          providerRequestId: params.providerRequestId ?? job.providerRequestId,
          actualProviderCostMicroUsd:
            params.actualProviderCostMicroUsd?.toString(),
          notes: params.notes,
          idempotencyKey: params.idempotencyKey,
          requestHash,
        },
      },
    });

    return {
      success: true,
      message: "Provider outcome reconciled and recorded.",
    };
  });
}

export async function recoverGeneratedOutput(
  params: RecoverGeneratedOutputParams,
) {
  const job = await db.generationJob.findUnique({
    where: { id: params.jobId },
    include: {
      providerModel: true,
      priceVersion: true,
      organization: { include: { wallet: true } },
      assets: true,
    },
  });

  if (!job) {
    throw new JobReconciliationError(
      "JOB_NOT_FOUND",
      `Job '${params.jobId}' was not found.`,
      404,
    );
  }

  if (job.status === "SUCCEEDED") {
    throw new JobReconciliationError(
      "JOB_ALREADY_SUCCEEDED",
      "Job has already completed successfully.",
      409,
    );
  }

  if (params.mode === "resume_processing") {
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM GenerationJob WHERE id = ${params.jobId} FOR UPDATE`;
      const current = await tx.generationJob.findUniqueOrThrow({
        where: { id: params.jobId },
      });

      if (
        current.status !== "MANUAL_REVIEW" &&
        current.status !== "PROCESSING"
      ) {
        throw new JobReconciliationError(
          "INVALID_STATE",
          `Cannot resume processing from status '${current.status}'.`,
          409,
        );
      }

      const updateData: Prisma.GenerationJobUpdateInput = {
        status: "PROCESSING",
        errorCode: null,
        errorMessage: null,
      };

      if (params.outputUrl) {
        updateData.outputPayload = { url: params.outputUrl };
      }

      await tx.generationJob.update({
        where: { id: params.jobId },
        data: updateData,
      });

      await tx.auditEvent.create({
        data: {
          actorUserId: params.actorUserId,
          organizationId: job.organizationId,
          action: "generation.resumed_processing",
          targetType: "GenerationJob",
          targetId: params.jobId,
          metadata: {
            reason: params.reason,
            outputUrl: params.outputUrl,
            idempotencyKey: params.idempotencyKey,
          },
        },
      });

      return {
        success: true,
        message: "Storage recovery resumed in processing state.",
      };
    });
  }

  // Immediate recovery mode
  const mediaKind = job.providerModel.mediaKind;

  if (mediaKind === "IMAGE") {
    const existingOutput = job.outputPayload as { url?: unknown } | null;
    const url =
      params.outputUrl ||
      (typeof existingOutput?.url === "string" ? existingOutput.url : null);

    if (!url) {
      throw new JobReconciliationError(
        "MISSING_OUTPUT_URL",
        "An image output URL is required to perform output recovery.",
        400,
      );
    }

    const bytes = await downloadImage(url);
    const stored = await storeImage(`${job.id}.png`, bytes);

    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM GenerationJob WHERE id = ${params.jobId} FOR UPDATE`;
      const current = await tx.generationJob.findUniqueOrThrow({
        where: { id: params.jobId },
      });

      const wallet = job.organization.wallet;
      if (!wallet) {
        throw new JobReconciliationError(
          "WALLET_NOT_FOUND",
          "Organization wallet was not found.",
          404,
        );
      }

      await captureCreditsForJob(tx, {
        walletId: wallet.id,
        jobId: job.id,
        amountCredits: current.reservedCredits,
        idempotencyKey: `generation-capture-${job.id}`,
      });

      await tx.asset.updateMany({
        where: { generationJobId: job.id, objectKey: `${job.id}.png` },
        data: { ...stored, status: "READY" },
      });

      await tx.generationJob.update({
        where: { id: job.id },
        data: {
          status: "SUCCEEDED",
          completedAt: new Date(),
          outputPayload: { stored: true },
          errorCode: null,
          errorMessage: null,
        },
      });

      await tx.auditEvent.create({
        data: {
          actorUserId: params.actorUserId,
          organizationId: job.organizationId,
          action: "generation.recovered",
          targetType: "GenerationJob",
          targetId: job.id,
          metadata: {
            reason: params.reason,
            outputUrl: url,
            byteSize: Number(stored.byteSize),
            sha256: stored.sha256,
            idempotencyKey: params.idempotencyKey,
          },
        },
      });

      return {
        success: true,
        message: "Image output recovered, stored, and credits captured.",
      };
    });
  }

  if (mediaKind === "VIDEO") {
    let outputUrl = params.outputUrl;

    if (!outputUrl && job.providerRequestId) {
      const provider = params.provider ?? getDefaultGenerationProvider();
      if (provider) {
        try {
          const providerJob = await provider.getJob(job.providerRequestId);
          if (
            providerJob.status === "succeeded" &&
            providerJob.outputUrls?.[0]
          ) {
            outputUrl = providerJob.outputUrls[0];
          }
        } catch {
          // Fall through if polling fails
        }
      }
    }

    if (!outputUrl) {
      throw new JobReconciliationError(
        "MISSING_OUTPUT_URL",
        "A video output URL is required or provider task must report succeeded with output.",
        400,
      );
    }

    const bytes = await downloadVideo(outputUrl);
    const stored = await storeVideo(`${job.id}.mp4`, bytes);

    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM GenerationJob WHERE id = ${params.jobId} FOR UPDATE`;
      const current = await tx.generationJob.findUniqueOrThrow({
        where: { id: params.jobId },
      });

      const wallet = job.organization.wallet;
      if (!wallet) {
        throw new JobReconciliationError(
          "WALLET_NOT_FOUND",
          "Organization wallet was not found.",
          404,
        );
      }

      await captureCreditsForJob(tx, {
        walletId: wallet.id,
        jobId: job.id,
        amountCredits: current.reservedCredits,
        idempotencyKey: `generation-capture-${job.id}`,
      });

      await tx.asset.updateMany({
        where: { generationJobId: job.id, objectKey: `${job.id}.mp4` },
        data: { ...stored, status: "READY" },
      });

      await tx.generationJob.update({
        where: { id: job.id },
        data: {
          status: "SUCCEEDED",
          completedAt: new Date(),
          outputPayload: { stored: true },
          errorCode: null,
          errorMessage: null,
        },
      });

      await tx.auditEvent.create({
        data: {
          actorUserId: params.actorUserId,
          organizationId: job.organizationId,
          action: "generation.recovered",
          targetType: "GenerationJob",
          targetId: job.id,
          metadata: {
            reason: params.reason,
            outputUrl,
            byteSize: Number(stored.byteSize),
            sha256: stored.sha256,
            idempotencyKey: params.idempotencyKey,
          },
        },
      });

      return {
        success: true,
        message: "Video output recovered, stored, and credits captured.",
      };
    });
  }

  throw new JobReconciliationError(
    "UNSUPPORTED_MEDIA_KIND",
    `Output recovery is not supported for ${mediaKind}.`,
    400,
  );
}

export async function releaseJobReservation(
  params: ReleaseJobReservationParams,
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM GenerationJob WHERE id = ${params.jobId} FOR UPDATE`;
    const job = await tx.generationJob.findUnique({
      where: { id: params.jobId },
      include: {
        organization: { include: { wallet: true } },
      },
    });

    if (!job) {
      throw new JobReconciliationError(
        "JOB_NOT_FOUND",
        `Job '${params.jobId}' was not found.`,
        404,
      );
    }

    if (job.status === "SUCCEEDED" || job.chargedCredits > 0n) {
      throw new JobReconciliationError(
        "JOB_ALREADY_SETTLED",
        "Cannot release reservation on a settled job. Use refund instead.",
        409,
      );
    }

    if (job.reservedCredits <= 0n) {
      throw new JobReconciliationError(
        "NO_RESERVATION",
        "Job has no active credit reservation to release.",
        409,
      );
    }

    const wallet = job.organization.wallet;
    if (!wallet) {
      throw new JobReconciliationError(
        "WALLET_NOT_FOUND",
        "Organization wallet was not found.",
        404,
      );
    }

    // Release held credits back to customer wallet
    const releaseEntry = await releaseOrRefundCredits(tx, {
      walletId: wallet.id,
      jobId: job.id,
      amountCredits: job.reservedCredits,
      reason: params.reason,
      idempotencyKey: params.idempotencyKey,
      metadata: {
        evidence: params.evidence,
        actorUserId: params.actorUserId,
      },
    });

    // Delete any pending asset allocation to free storage quota immediately
    await tx.asset.updateMany({
      where: { generationJobId: job.id, status: "PENDING" },
      data: { status: "DELETED", byteSize: 0n },
    });

    // Mark job FAILED with administrative release code
    await tx.generationJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        errorCode: "ADMIN_RELEASED",
        errorMessage: params.reason,
        completedAt: new Date(),
      },
    });

    await tx.auditEvent.create({
      data: {
        actorUserId: params.actorUserId,
        organizationId: job.organizationId,
        action: "generation.reservation_released",
        targetType: "GenerationJob",
        targetId: job.id,
        metadata: {
          reason: params.reason,
          evidence: params.evidence,
          releasedCredits: job.reservedCredits.toString(),
          ledgerEntryId: releaseEntry.id,
          idempotencyKey: params.idempotencyKey,
        },
      },
    });

    return {
      success: true,
      message: `Credit reservation (${job.reservedCredits.toString()} credits) and pending storage released.`,
      releasedCredits: job.reservedCredits.toString(),
    };
  });
}

export async function refundSettledJob(params: RefundSettledJobParams) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM GenerationJob WHERE id = ${params.jobId} FOR UPDATE`;
    const job = await tx.generationJob.findUnique({
      where: { id: params.jobId },
      include: {
        organization: { include: { wallet: true } },
      },
    });

    if (!job) {
      throw new JobReconciliationError(
        "JOB_NOT_FOUND",
        `Job '${params.jobId}' was not found.`,
        404,
      );
    }

    if (job.chargedCredits <= 0n) {
      throw new JobReconciliationError(
        "NO_CHARGED_CREDITS",
        "Job has no charged credits to refund.",
        409,
      );
    }

    const wallet = job.organization.wallet;
    if (!wallet) {
      throw new JobReconciliationError(
        "WALLET_NOT_FOUND",
        "Organization wallet was not found.",
        404,
      );
    }

    const captureEntry = await tx.ledgerEntry.findFirst({
      where: {
        walletId: wallet.id,
        referenceType: "GENERATION_JOB",
        referenceId: job.id,
        type: "CAPTURE",
      },
      include: { reversedBy: true },
    });

    if (!captureEntry) {
      throw new JobReconciliationError(
        "CAPTURE_NOT_FOUND",
        "No capture ledger entry was found for this job.",
        404,
      );
    }

    if (captureEntry.reversedBy) {
      throw new JobReconciliationError(
        "ALREADY_REFUNDED",
        "Job has already been refunded.",
        409,
      );
    }

    const refundAmount = params.amountCredits ?? job.chargedCredits;
    if (refundAmount <= 0n || refundAmount > job.chargedCredits) {
      throw new JobReconciliationError(
        "INVALID_REFUND_AMOUNT",
        `Refund amount must be between 1 and ${job.chargedCredits.toString()} credits.`,
        400,
      );
    }

    const refundEntry = await releaseOrRefundCredits(tx, {
      walletId: wallet.id,
      jobId: job.id,
      amountCredits: refundAmount,
      reason: params.reason,
      idempotencyKey: params.idempotencyKey,
      metadata: {
        actorUserId: params.actorUserId,
        reason: params.reason,
      },
    });

    await tx.auditEvent.create({
      data: {
        actorUserId: params.actorUserId,
        organizationId: job.organizationId,
        action: "generation.refunded",
        targetType: "GenerationJob",
        targetId: job.id,
        metadata: {
          reason: params.reason,
          refundedCredits: refundAmount.toString(),
          ledgerEntryId: refundEntry.id,
          idempotencyKey: params.idempotencyKey,
        },
      },
    });

    return {
      success: true,
      message: `Refund of ${refundAmount.toString()} credits processed successfully.`,
      refundedCredits: refundAmount.toString(),
    };
  });
}
