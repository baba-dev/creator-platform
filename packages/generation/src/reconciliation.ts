import { captureCreditsForJob, releaseOrRefundCredits } from "@aiwa/credits";
import { db, type Prisma } from "@aiwa/db";
import { parseServerEnv } from "@aiwa/config";
import { type MediaGenerationProvider } from "@aiwa/providers";
import { createBytePlusProvider } from "@aiwa/providers/byteplus";
import {
  downloadImage,
  downloadVideo,
  storeImage,
  storeVideo,
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
  outcome: "SUCCEEDED" | "FAILED" | "NOT_SUBMITTED";
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

  // Calculate permitted actions
  const permittedActions: JobPermittedActions = {
    canReconcile: true,
    canRecover: false,
    canRelease: false,
    canRefund: false,
  };

  // Reconcile is always permitted for operators to record evidence
  permittedActions.reconcileReason =
    "Record provider investigation and evidence.";

  // Release reservation permitted if reservedCredits > 0 and no capture/settlement
  if (
    job.reservedCredits > 0n &&
    job.chargedCredits === 0n &&
    !captureEntry &&
    !releaseEntry
  ) {
    permittedActions.canRelease = true;
    permittedActions.releaseReason =
      "Held reservation can be released back to customer wallet once verified no provider charge occurred.";
  } else if (job.chargedCredits > 0n || captureEntry) {
    permittedActions.canRelease = false;
    permittedActions.releaseReason =
      "Credits for this job have already been captured/settled. Use Refund instead.";
  } else if (releaseEntry) {
    permittedActions.canRelease = false;
    permittedActions.releaseReason = "Reservation has already been released.";
  } else {
    permittedActions.canRelease = false;
    permittedActions.releaseReason =
      "No active credit reservation on this job.";
  }

  // Recover output permitted if job is in MANUAL_REVIEW or PROCESSING, or has output URL without ready asset
  const hasUnpersistedOutput =
    job.status === "MANUAL_REVIEW" ||
    (job.status === "PROCESSING" &&
      job.assets.some((a) => a.status === "PENDING"));

  if (hasUnpersistedOutput) {
    permittedActions.canRecover = true;
    permittedActions.recoverReason =
      "Output can be recovered and finalized without submitting a new generation request.";
  } else if (job.status === "SUCCEEDED") {
    permittedActions.canRecover = false;
    permittedActions.recoverReason =
      "Job output has already been successfully stored.";
  } else {
    permittedActions.canRecover = false;
    permittedActions.recoverReason =
      "Recovery is only available for jobs with unfinalized media in MANUAL_REVIEW or PROCESSING.";
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
      return { success: true, message: "Reconciliation already recorded." };
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
      (params.outcome === "FAILED" || params.outcome === "NOT_SUBMITTED")
    ) {
      updateData.errorCode =
        params.outcome === "FAILED"
          ? "PROVIDER_CONFIRMED_FAILED"
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
