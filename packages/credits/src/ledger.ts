import { requireNonNegativeInteger } from "@aiwa/core";
import { type LedgerEntry, type Prisma } from "@aiwa/db";

export class LedgerDomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "LedgerDomainError";
  }
}

export class InsufficientCreditsError extends LedgerDomainError {
  constructor(
    public readonly available: bigint,
    public readonly required: bigint,
  ) {
    super(
      "INSUFFICIENT_CREDITS",
      `Wallet balance (${available} credits) is insufficient for requested ${required} credits.`,
    );
  }
}

export class WalletNotFoundError extends LedgerDomainError {
  constructor(walletId: string) {
    super("WALLET_NOT_FOUND", `Wallet '${walletId}' was not found.`);
  }
}

export class ReservationNotFoundError extends LedgerDomainError {
  constructor(jobId: string) {
    super(
      "RESERVATION_NOT_FOUND",
      `No active credit reservation found for generation job '${jobId}'.`,
    );
  }
}

export class ReservationAlreadySettledError extends LedgerDomainError {
  constructor(jobId: string, settlementType: string) {
    super(
      "RESERVATION_ALREADY_SETTLED",
      `Reservation for job '${jobId}' has already been settled via ${settlementType}.`,
    );
  }
}

export class IdempotencyConflictError extends LedgerDomainError {
  constructor(idempotencyKey: string, details?: string) {
    super(
      "IDEMPOTENCY_CONFLICT",
      `Idempotency key '${idempotencyKey}' was already used with conflicting parameters${details ? `: ${details}` : ""}.`,
    );
  }
}

export class InvalidAmountError extends LedgerDomainError {
  constructor(message: string) {
    super("INVALID_AMOUNT", message);
  }
}

export interface ReserveCreditsParams {
  walletId: string;
  amountCredits: bigint;
  idempotencyKey: string;
  jobId: string;
  description?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface CaptureCreditsParams {
  walletId: string;
  amountCredits: bigint;
  idempotencyKey: string;
  jobId: string;
  description?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface ReleaseOrRefundCreditsParams {
  walletId: string;
  amountCredits?: bigint;
  reason: string;
  jobId: string;
  idempotencyKey?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface GrantCreditsParams {
  walletId: string;
  amountCredits: bigint;
  type: "PAYMENT_GRANT" | "ADMIN_GRANT";
  idempotencyKey: string;
  description?: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Prisma.InputJsonValue;
}

async function lockAndGetWallet(
  tx: Prisma.TransactionClient,
  walletId: string,
): Promise<{ id: string; balanceCache: bigint; version: number }> {
  await tx.$queryRaw`SELECT id, balanceCache, version FROM Wallet WHERE id = ${walletId} FOR UPDATE`;
  const wallet = await tx.wallet.findUnique({
    where: { id: walletId },
    select: { id: true, balanceCache: true, version: true },
  });
  if (!wallet) {
    throw new WalletNotFoundError(walletId);
  }
  return wallet;
}

export async function reserveCreditsForJob(
  tx: Prisma.TransactionClient,
  params: ReserveCreditsParams,
): Promise<LedgerEntry> {
  const amount = requireNonNegativeInteger(
    params.amountCredits,
    "amountCredits",
  );
  if (amount === 0n) {
    throw new InvalidAmountError(
      "Reservation amount must be greater than zero",
    );
  }

  const existing = await tx.ledgerEntry.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
  });
  if (existing) {
    if (
      existing.walletId === params.walletId &&
      existing.referenceId === params.jobId &&
      existing.amountCredits === amount &&
      existing.type === "RESERVATION"
    ) {
      return existing;
    }
    throw new IdempotencyConflictError(
      params.idempotencyKey,
      "Existing entry does not match reservation parameters",
    );
  }

  const wallet = await lockAndGetWallet(tx, params.walletId);
  if (wallet.balanceCache < amount) {
    throw new InsufficientCreditsError(wallet.balanceCache, amount);
  }

  const balanceAfter = wallet.balanceCache - amount;

  const entry = await tx.ledgerEntry.create({
    data: {
      walletId: params.walletId,
      type: "RESERVATION",
      amountCredits: amount,
      balanceAfter,
      idempotencyKey: params.idempotencyKey,
      referenceType: "GENERATION_JOB",
      referenceId: params.jobId,
      description:
        params.description ?? `Reservation for generation job ${params.jobId}`,
      metadata: params.metadata,
    },
  });

  await tx.wallet.update({
    where: { id: params.walletId },
    data: {
      balanceCache: balanceAfter,
      version: { increment: 1 },
    },
  });

  const job = await tx.generationJob.findUnique({
    where: { id: params.jobId },
    select: { id: true, status: true },
  });
  if (job) {
    await tx.generationJob.update({
      where: { id: params.jobId },
      data: {
        reservedCredits: amount,
        status: "CREDIT_RESERVED",
      },
    });
  }

  return entry;
}

export async function captureCreditsForJob(
  tx: Prisma.TransactionClient,
  params: CaptureCreditsParams,
): Promise<LedgerEntry> {
  const amount = requireNonNegativeInteger(
    params.amountCredits,
    "amountCredits",
  );

  const existing = await tx.ledgerEntry.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
  });
  if (existing) {
    if (
      existing.walletId === params.walletId &&
      existing.referenceId === params.jobId &&
      existing.amountCredits === amount &&
      existing.type === "CAPTURE"
    ) {
      return existing;
    }
    throw new IdempotencyConflictError(
      params.idempotencyKey,
      "Existing entry does not match capture parameters",
    );
  }

  const reservation = await tx.ledgerEntry.findFirst({
    where: {
      walletId: params.walletId,
      referenceType: "GENERATION_JOB",
      referenceId: params.jobId,
      type: "RESERVATION",
    },
    include: { reversedBy: true },
  });

  if (!reservation) {
    throw new ReservationNotFoundError(params.jobId);
  }

  if (reservation.reversedBy) {
    throw new ReservationAlreadySettledError(
      params.jobId,
      reservation.reversedBy.type,
    );
  }

  const existingCapture = await tx.ledgerEntry.findFirst({
    where: {
      walletId: params.walletId,
      referenceType: "GENERATION_JOB",
      referenceId: params.jobId,
      type: "CAPTURE",
    },
  });
  if (existingCapture) {
    throw new ReservationAlreadySettledError(params.jobId, "CAPTURE");
  }

  const wallet = await lockAndGetWallet(tx, params.walletId);

  let balanceAfter = wallet.balanceCache;
  if (amount < reservation.amountCredits) {
    const diff = reservation.amountCredits - amount;
    balanceAfter = wallet.balanceCache + diff;
  } else if (amount > reservation.amountCredits) {
    const extra = amount - reservation.amountCredits;
    if (wallet.balanceCache < extra) {
      throw new InsufficientCreditsError(wallet.balanceCache, extra);
    }
    balanceAfter = wallet.balanceCache - extra;
  }

  const metadataJson =
    typeof params.metadata === "object" && params.metadata !== null
      ? (params.metadata as Record<string, unknown>)
      : {};

  const entry = await tx.ledgerEntry.create({
    data: {
      walletId: params.walletId,
      type: "CAPTURE",
      amountCredits: amount,
      balanceAfter,
      idempotencyKey: params.idempotencyKey,
      referenceType: "GENERATION_JOB",
      referenceId: params.jobId,
      description:
        params.description ?? `Capture for generation job ${params.jobId}`,
      metadata: {
        ...metadataJson,
        reservationEntryId: reservation.id,
        reservedCredits: reservation.amountCredits.toString(),
      },
    },
  });

  if (balanceAfter !== wallet.balanceCache) {
    await tx.wallet.update({
      where: { id: params.walletId },
      data: {
        balanceCache: balanceAfter,
        version: { increment: 1 },
      },
    });
  }

  const job = await tx.generationJob.findUnique({
    where: { id: params.jobId },
    select: { id: true },
  });
  if (job) {
    await tx.generationJob.update({
      where: { id: params.jobId },
      data: {
        chargedCredits: amount,
      },
    });
  }

  return entry;
}

export async function releaseOrRefundCredits(
  tx: Prisma.TransactionClient,
  params: ReleaseOrRefundCreditsParams,
): Promise<LedgerEntry> {
  const capture = await tx.ledgerEntry.findFirst({
    where: {
      walletId: params.walletId,
      referenceType: "GENERATION_JOB",
      referenceId: params.jobId,
      type: "CAPTURE",
    },
    include: { reversedBy: true },
  });

  if (capture) {
    if (capture.reversedBy) {
      if (
        params.idempotencyKey &&
        capture.reversedBy.idempotencyKey === params.idempotencyKey
      ) {
        return capture.reversedBy;
      }
      throw new ReservationAlreadySettledError(
        params.jobId,
        capture.reversedBy.type,
      );
    }

    const refundAmount =
      params.amountCredits !== undefined
        ? requireNonNegativeInteger(params.amountCredits, "amountCredits")
        : capture.amountCredits;

    if (refundAmount === 0n || refundAmount > capture.amountCredits) {
      throw new InvalidAmountError(
        `Refund amount must be between 1 and ${capture.amountCredits} credits`,
      );
    }

    const wallet = await lockAndGetWallet(tx, params.walletId);
    const balanceAfter = wallet.balanceCache + refundAmount;
    const idempotencyKey =
      params.idempotencyKey ?? `refund-${params.jobId}-${capture.id}`;

    const metadataJson =
      typeof params.metadata === "object" && params.metadata !== null
        ? (params.metadata as Record<string, unknown>)
        : {};

    const refundEntry = await tx.ledgerEntry.create({
      data: {
        walletId: params.walletId,
        type: "REFUND",
        amountCredits: refundAmount,
        balanceAfter,
        idempotencyKey,
        referenceType: "GENERATION_JOB",
        referenceId: params.jobId,
        reversalOfId: capture.id,
        description: params.reason,
        metadata: {
          ...metadataJson,
          reason: params.reason,
          captureEntryId: capture.id,
        },
      },
    });

    await tx.wallet.update({
      where: { id: params.walletId },
      data: {
        balanceCache: balanceAfter,
        version: { increment: 1 },
      },
    });

    return refundEntry;
  }

  const reservation = await tx.ledgerEntry.findFirst({
    where: {
      walletId: params.walletId,
      referenceType: "GENERATION_JOB",
      referenceId: params.jobId,
      type: "RESERVATION",
    },
    include: { reversedBy: true },
  });

  if (reservation) {
    if (reservation.reversedBy) {
      if (
        params.idempotencyKey &&
        reservation.reversedBy.idempotencyKey === params.idempotencyKey
      ) {
        return reservation.reversedBy;
      }
      throw new ReservationAlreadySettledError(
        params.jobId,
        reservation.reversedBy.type,
      );
    }

    const releaseAmount =
      params.amountCredits !== undefined
        ? requireNonNegativeInteger(params.amountCredits, "amountCredits")
        : reservation.amountCredits;

    if (releaseAmount === 0n || releaseAmount > reservation.amountCredits) {
      throw new InvalidAmountError(
        `Release amount must be between 1 and ${reservation.amountCredits} credits`,
      );
    }

    const wallet = await lockAndGetWallet(tx, params.walletId);
    const balanceAfter = wallet.balanceCache + releaseAmount;
    const idempotencyKey =
      params.idempotencyKey ?? `release-${params.jobId}-${reservation.id}`;

    const metadataJson =
      typeof params.metadata === "object" && params.metadata !== null
        ? (params.metadata as Record<string, unknown>)
        : {};

    const releaseEntry = await tx.ledgerEntry.create({
      data: {
        walletId: params.walletId,
        type: "RELEASE",
        amountCredits: releaseAmount,
        balanceAfter,
        idempotencyKey,
        referenceType: "GENERATION_JOB",
        referenceId: params.jobId,
        reversalOfId: reservation.id,
        description: params.reason,
        metadata: {
          ...metadataJson,
          reason: params.reason,
          reservationEntryId: reservation.id,
        },
      },
    });

    await tx.wallet.update({
      where: { id: params.walletId },
      data: {
        balanceCache: balanceAfter,
        version: { increment: 1 },
      },
    });

    const job = await tx.generationJob.findUnique({
      where: { id: params.jobId },
      select: { id: true },
    });
    if (job) {
      await tx.generationJob.update({
        where: { id: params.jobId },
        data: { reservedCredits: 0n },
      });
    }

    return releaseEntry;
  }

  throw new ReservationNotFoundError(params.jobId);
}

export async function grantCredits(
  tx: Prisma.TransactionClient,
  params: GrantCreditsParams,
): Promise<LedgerEntry> {
  const amount = requireNonNegativeInteger(
    params.amountCredits,
    "amountCredits",
  );
  if (amount === 0n) {
    throw new InvalidAmountError("Grant amount must be greater than zero");
  }

  const description =
    params.description ??
    (params.type === "PAYMENT_GRANT"
      ? "Payment credit grant"
      : "Administrative credit grant");

  const existing = await tx.ledgerEntry.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
  });
  if (existing) {
    if (
      existing.walletId === params.walletId &&
      existing.amountCredits === amount &&
      existing.type === params.type &&
      existing.referenceType === (params.referenceType ?? null) &&
      existing.referenceId === (params.referenceId ?? null) &&
      existing.description === description
    ) {
      return existing;
    }
    throw new IdempotencyConflictError(
      params.idempotencyKey,
      "Existing grant entry does not match parameters",
    );
  }

  const wallet = await lockAndGetWallet(tx, params.walletId);
  const balanceAfter = wallet.balanceCache + amount;

  const entry = await tx.ledgerEntry.create({
    data: {
      walletId: params.walletId,
      type: params.type,
      amountCredits: amount,
      balanceAfter,
      idempotencyKey: params.idempotencyKey,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      description,
      metadata: params.metadata,
    },
  });

  await tx.wallet.update({
    where: { id: params.walletId },
    data: {
      balanceCache: balanceAfter,
      version: { increment: 1 },
    },
  });

  return entry;
}

export async function getWalletBalance(
  client: Prisma.TransactionClient,
  walletId: string,
): Promise<bigint> {
  const wallet = await client.wallet.findUnique({
    where: { id: walletId },
    select: { balanceCache: true },
  });
  if (!wallet) throw new WalletNotFoundError(walletId);
  return wallet.balanceCache;
}
