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
  "SUCCEEDED" | "FAILED" | "CANCELLED" | "NOT_SUBMITTED";

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
    job.status === "MANUAL_REVIEW" && reconciliationOutcome === "SUCCEEDED";

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
  const mode = params.mode ?? "immediate";
  const requestHash = resolutionHash({
    action: "recover",
    mode,
    reason: params.reason,
    outputUrl: params.outputUrl ?? null,
  });

  const job = await db.generationJob.findUnique({
    where: { id: params.jobId },
    include: {
      providerModel: true,
      organization: { include: { wallet: true } },
      assets: true,
    },
  });

  if (!job) {
    throw new JobReconciliationError(
      "JOB_NOT_FOUND",
      "Generation job was not found.",
      404,
    );
  }

  const priorResolutionAudits = await db.auditEvent.findMany({
    where: {
      targetType: "GenerationJob",
      targetId: params.jobId,
      action: { startsWith: "generation." },
    },
    orderBy: { createdAt: "desc" },
  });
  const priorResolution =
    priorResolutionAudits.find(
      (event) =>
        metadataObject(event.metadata).idempotencyKey === params.idempotencyKey,
    ) ?? null;
  const preflightReplay = replayResult(
    priorResolution,
    mode === "resume_processing"
      ? "generation.resumed_processing"
      : "generation.recovered",
    requestHash,
    mode === "resume_processing"
      ? "Storage recovery was already resumed."
      : "Generated output was already recovered.",
  );
  if (preflightReplay) return preflightReplay;

  if (mode === "resume_processing") {
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM GenerationJob WHERE id = ${params.jobId} FOR UPDATE`;
      const current = await tx.generationJob.findUniqueOrThrow({
        where: { id: params.jobId },
      });

      const existing = await findResolutionAudit(
        tx,
        params.jobId,
        params.idempotencyKey,
      );
      const replay = replayResult(
        existing,
        "generation.resumed_processing",
        requestHash,
        "Storage recovery was already resumed.",
      );
      if (replay) return replay;

      assertManualReview(current.status);
      const outcome = await latestReconciledOutcome(tx, params.jobId);
      if (outcome !== "SUCCEEDED") {
        throw new JobReconciliationError(
          "RECONCILIATION_REQUIRED",
          "Provider success must be reconciled before resuming storage recovery.",
          409,
        );
      }

      const updateData: Prisma.GenerationJobUpdateInput = {
        status: "PROCESSING",
        errorCode: null,
        errorMessage: null,
      };

      if (job.providerModel.mediaKind === "IMAGE") {
        const output = current.outputPayload as { url?: unknown } | null;
        const outputUrl =
          params.outputUrl ||
          (typeof output?.url === "string" ? output.url : undefined);
        if (!outputUrl) {
          throw new JobReconciliationError(
            "MISSING_OUTPUT_URL",
            "Image storage recovery requires the already-generated output URL.",
            400,
          );
        }
        updateData.outputPayload = { url: outputUrl };
      } else if (job.providerModel.mediaKind === "VIDEO") {
        if (!current.providerRequestId) {
          throw new JobReconciliationError(
            "MISSING_PROVIDER_REQUEST_ID",
            "Video background recovery requires a provider request ID. Use immediate recovery with a verified output URL instead.",
            400,
          );
        }
      } else if (job.providerModel.mediaKind === "VOICE") {
        throw new JobReconciliationError(
          "VOICE_RESUME_UNSUPPORTED",
          "Voice synthesis cannot be resumed safely. Use immediate recovery to finalize an already-stored MP3.",
          400,
        );
      } else {
        throw new JobReconciliationError(
          "UNSUPPORTED_MEDIA_KIND",
          "This media kind does not support storage recovery.",
          400,
        );
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
            requestHash,
          },
        },
      });

      return {
        success: true,
        message: "Storage recovery resumed without resubmitting generation.",
      };
    });
  }

  const mediaKind = job.providerModel.mediaKind;
  let outputUrl: string | undefined = params.outputUrl;
  let bytes: Buffer;
  let objectKey: string;

  if (mediaKind === "IMAGE") {
    const output = job.outputPayload as { url?: unknown } | null;
    outputUrl =
      outputUrl || (typeof output?.url === "string" ? output.url : undefined);
    if (!outputUrl) {
      throw new JobReconciliationError(
        "MISSING_OUTPUT_URL",
        "An image output URL is required to recover generated output.",
        400,
      );
    }
    bytes = await downloadImage(outputUrl);
    objectKey = job.id + ".png";
  } else if (mediaKind === "VIDEO") {
    const output = job.outputPayload as { url?: unknown } | null;
    outputUrl =
      outputUrl || (typeof output?.url === "string" ? output.url : undefined);

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
          // An operator may still supply a verified provider output URL.
        }
      }
    }

    if (!outputUrl) {
      throw new JobReconciliationError(
        "MISSING_OUTPUT_URL",
        "A verified video output URL is required or the provider task must report success.",
        400,
      );
    }
    bytes = await downloadVideo(outputUrl);
    objectKey = job.id + ".mp4";
  } else if (mediaKind === "VOICE") {
    if (params.outputUrl) {
      throw new JobReconciliationError(
        "VOICE_OUTPUT_URL_UNSUPPORTED",
        "Voice recovery only finalizes an MP3 already stored by the original synthesis attempt.",
        400,
      );
    }
    objectKey = job.id + ".mp3";
    try {
      bytes = await readStoredAsset(objectKey);
      validateMp3Bytes(bytes);
    } catch {
      throw new JobReconciliationError(
        "VOICE_OUTPUT_NOT_RECOVERABLE",
        "No valid already-generated MP3 is available to finalize. Do not resubmit synthesis; reconcile a non-successful outcome before releasing credits.",
        409,
      );
    }
  } else {
    throw new JobReconciliationError(
      "UNSUPPORTED_MEDIA_KIND",
      "Output recovery is not supported for this media kind.",
      400,
    );
  }

  let wroteStoredAsset = false;
  try {
    return await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM GenerationJob WHERE id = ${params.jobId} FOR UPDATE`;
      const current = await tx.generationJob.findUniqueOrThrow({
        where: { id: params.jobId },
      });

      const existing = await findResolutionAudit(
        tx,
        params.jobId,
        params.idempotencyKey,
      );
      const replay = replayResult(
        existing,
        "generation.recovered",
        requestHash,
        "Generated output was already recovered.",
      );
      if (replay) return replay;

      if (
        current.status !== "MANUAL_REVIEW" &&
        current.status !== "PROCESSING"
      ) {
        throw new JobReconciliationError(
          "INVALID_STATE",
          "Output recovery is only permitted from MANUAL_REVIEW or PROCESSING.",
          409,
        );
      }

      if (current.status === "MANUAL_REVIEW") {
        const outcome = await latestReconciledOutcome(tx, params.jobId);
        if (outcome !== "SUCCEEDED") {
          throw new JobReconciliationError(
            "RECONCILIATION_REQUIRED",
            "Provider success must be reconciled before generated output can be finalized.",
            409,
          );
        }
      }

      if (current.chargedCredits > 0n || current.reservedCredits <= 0n) {
        throw new JobReconciliationError(
          "INVALID_ACCOUNTING_STATE",
          "This job no longer has an active reservation that can be captured.",
          409,
        );
      }

      const wallet = await tx.wallet.findUnique({
        where: { organizationId: current.organizationId },
      });
      if (!wallet) {
        throw new JobReconciliationError(
          "WALLET_NOT_FOUND",
          "Organization wallet was not found.",
          404,
        );
      }

      let stored: { byteSize: bigint; sha256: string };
      if (mediaKind === "IMAGE") {
        stored = await storeImage(objectKey, bytes);
        wroteStoredAsset = true;
      } else if (mediaKind === "VIDEO") {
        stored = await storeVideo(objectKey, bytes);
        wroteStoredAsset = true;
      } else {
        stored = {
          byteSize: BigInt(bytes.byteLength),
          sha256: createHash("sha256").update(bytes).digest("hex"),
        };
      }

      await captureCreditsForJob(tx, {
        walletId: wallet.id,
        jobId: current.id,
        amountCredits: current.reservedCredits,
        idempotencyKey: "generation-capture-" + current.id,
      });

      await tx.asset.update({
        where: { objectKey },
        data: { ...stored, status: "READY" },
      });

      await tx.generationJob.update({
        where: { id: current.id },
        data: {
          status: "SUCCEEDED",
          completedAt: new Date(),
          outputPayload:
            mediaKind === "VOICE"
              ? {
                  stored: true,
                  byteSize: Number(stored.byteSize),
                  sha256: stored.sha256,
                }
              : { stored: true },
          errorCode: null,
          errorMessage: null,
        },
      });

      await tx.auditEvent.create({
        data: {
          actorUserId: params.actorUserId,
          organizationId: current.organizationId,
          action: "generation.recovered",
          targetType: "GenerationJob",
          targetId: current.id,
          metadata: {
            reason: params.reason,
            outputUrl,
            mediaKind,
            byteSize: Number(stored.byteSize),
            sha256: stored.sha256,
            idempotencyKey: params.idempotencyKey,
            requestHash,
          },
        },
      });

      return {
        success: true,
        message:
          mediaKind === "VOICE"
            ? "Stored voice output validated, finalized, and credits captured."
            : "Generated output recovered, stored, and credits captured.",
      };
    });
  } catch (error) {
    if (wroteStoredAsset) {
      await deleteStoredAsset(objectKey).catch(() => undefined);
    }
    throw error;
  }
}

export async function releaseJobReservation(
  params: ReleaseJobReservationParams,
) {
  const requestHash = resolutionHash({
    action: "release",
    reason: params.reason,
    evidence: params.evidence,
  });

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
        "Generation job was not found.",
        404,
      );
    }

    const existing = await findResolutionAudit(
      tx,
      params.jobId,
      params.idempotencyKey,
    );
    const replay = replayResult(
      existing,
      "generation.reservation_released",
      requestHash,
      "Reservation was already released.",
    );
    if (replay) return replay;

    assertManualReview(job.status);
    const outcome = await latestReconciledOutcome(tx, params.jobId);
    if (
      outcome !== "FAILED" &&
      outcome !== "CANCELLED" &&
      outcome !== "NOT_SUBMITTED"
    ) {
      throw new JobReconciliationError(
        "RECONCILIATION_REQUIRED",
        "Reconcile the provider outcome as FAILED, CANCELLED, or NOT_SUBMITTED before releasing credits.",
        409,
      );
    }

    if (job.chargedCredits > 0n) {
      throw new JobReconciliationError(
        "JOB_ALREADY_SETTLED",
        "Cannot release a captured reservation. Use refund instead.",
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

    const releaseEntry = await releaseOrRefundCredits(tx, {
      walletId: wallet.id,
      jobId: job.id,
      amountCredits: job.reservedCredits,
      reason: params.reason,
      idempotencyKey: params.idempotencyKey,
      metadata: {
        evidence: params.evidence,
        actorUserId: params.actorUserId,
        reconciliationOutcome: outcome,
      },
    });

    await tx.asset.updateMany({
      where: { generationJobId: job.id, status: "PENDING" },
      data: { status: "DELETED", byteSize: 0n },
    });

    await tx.generationJob.update({
      where: { id: job.id },
      data: {
        status: outcome === "CANCELLED" ? "CANCELLED" : "FAILED",
        reservedCredits: 0n,
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
          reconciliationOutcome: outcome,
          releasedCredits: job.reservedCredits.toString(),
          ledgerEntryId: releaseEntry.id,
          idempotencyKey: params.idempotencyKey,
          requestHash,
        },
      },
    });

    return {
      success: true,
      message:
        "Reservation released, pending storage allocation removed, and job resolved.",
      releasedCredits: job.reservedCredits.toString(),
    };
  });
}

export async function refundSettledJob(params: RefundSettledJobParams) {
  const requestHash = resolutionHash({
    action: "refund",
    amountCredits: params.amountCredits?.toString() ?? null,
    reason: params.reason,
  });

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
        "Generation job was not found.",
        404,
      );
    }

    const existing = await findResolutionAudit(
      tx,
      params.jobId,
      params.idempotencyKey,
    );
    const replay = replayResult(
      existing,
      "generation.refunded",
      requestHash,
      "Refund was already processed.",
    );
    if (replay) return replay;

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
          requestHash,
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
