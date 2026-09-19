import { db, Prisma } from "@aiwa/db";
import {
  grantCredits,
  IdempotencyConflictError,
  InsufficientCreditsError,
} from "@aiwa/credits";

export type { LedgerEntry, ManualPayment } from "@aiwa/db";
import type { LedgerEntry, ManualPayment } from "@aiwa/db";

const MAX_SIGNED_BIGINT = 9_223_372_036_854_775_807n;

function normalizeOptional(value: string | null | undefined): string | null {
  return value ?? null;
}

// ---------------------------------------------------------------------------
// Re-export errors from @aiwa/credits
// ---------------------------------------------------------------------------
export {
  InsufficientCreditsError,
  IdempotencyConflictError,
} from "@aiwa/credits";

// ---------------------------------------------------------------------------
// Domain error classes
// ---------------------------------------------------------------------------

export class PaymentDomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PaymentDomainError";
  }
}

export class PaymentNotFoundError extends PaymentDomainError {
  constructor(paymentId: string) {
    super("PAYMENT_NOT_FOUND", `ManualPayment '${paymentId}' was not found.`);
    this.name = "PaymentNotFoundError";
  }
}

export class InvalidPaymentTransitionError extends PaymentDomainError {
  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super(
      "INVALID_PAYMENT_TRANSITION",
      `Cannot transition payment from '${from}' to '${to}'.`,
    );
    this.name = "InvalidPaymentTransitionError";
  }
}

export class PaymentAlreadySettledError extends PaymentDomainError {
  constructor(paymentId: string) {
    super(
      "PAYMENT_ALREADY_SETTLED",
      `Payment '${paymentId}' has already been settled and cannot be modified.`,
    );
    this.name = "PaymentAlreadySettledError";
  }
}

// ---------------------------------------------------------------------------
// Param interfaces
// ---------------------------------------------------------------------------

export interface RecordPaymentParams {
  organizationId: string;
  createdById: string;
  method: "CASH" | "CHEQUE";
  amountBaisa: bigint;
  receivedAt: Date;
  reference?: string;
  chequeNumber?: string;
  bankName?: string;
  notes?: string;
  idempotencyKey: string;
}

export interface ConfirmPaymentParams {
  organizationId: string;
  paymentId: string;
  confirmedById: string;
  creditsPerBaisa: bigint;
  idempotencyKey: string;
}

export interface RejectPaymentParams {
  organizationId: string;
  paymentId: string;
  actorUserId: string;
  reason: string;
  idempotencyKey: string;
}

export interface ReversePaymentParams {
  organizationId: string;
  paymentId: string;
  actorUserId: string;
  reason: string;
  idempotencyKey: string;
}

export interface GrantAdminCreditsParams {
  organizationId: string;
  actorUserId: string;
  amountCredits: bigint;
  reason: string;
  idempotencyKey: string;
}

// ---------------------------------------------------------------------------
// Internal Transaction Implementations
// ---------------------------------------------------------------------------

export async function _recordPaymentTx(
  tx: Prisma.TransactionClient,
  params: RecordPaymentParams,
): Promise<ManualPayment> {
  if (params.amountBaisa <= 0n || params.amountBaisa > MAX_SIGNED_BIGINT) {
    throw new PaymentDomainError(
      "INVALID_PAYMENT_AMOUNT",
      "Payment amount must be a positive signed 64-bit integer.",
    );
  }

  const existing = await tx.manualPayment.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
  });

  if (existing) {
    if (
      existing.organizationId === params.organizationId &&
      existing.createdById === params.createdById &&
      existing.method === params.method &&
      existing.amountBaisa === params.amountBaisa &&
      existing.receivedAt.getTime() === params.receivedAt.getTime() &&
      existing.reference === normalizeOptional(params.reference) &&
      existing.chequeNumber === normalizeOptional(params.chequeNumber) &&
      existing.bankName === normalizeOptional(params.bankName) &&
      existing.notes === normalizeOptional(params.notes)
    ) {
      return existing;
    }
    throw new IdempotencyConflictError(
      params.idempotencyKey,
      "Existing manual payment does not match parameters",
    );
  }

  const initialStatus = params.method === "CASH" ? "DRAFT" : "PENDING";

  const payment = await tx.manualPayment.create({
    data: {
      organizationId: params.organizationId,
      createdById: params.createdById,
      method: params.method,
      status: initialStatus,
      amountBaisa: params.amountBaisa,
      receivedAt: params.receivedAt,
      reference: params.reference ?? null,
      chequeNumber: params.chequeNumber ?? null,
      bankName: params.bankName ?? null,
      notes: params.notes ?? null,
      idempotencyKey: params.idempotencyKey,
    },
  });

  await tx.auditEvent.create({
    data: {
      actorUserId: params.createdById,
      organizationId: params.organizationId,
      action: "payment.recorded",
      targetType: "ManualPayment",
      targetId: payment.id,
      requestId: params.idempotencyKey,
      metadata: {
        method: params.method,
        amountBaisa: params.amountBaisa.toString(),
        status: initialStatus,
      },
    },
  });

  return payment;
}

export async function _confirmPaymentTx(
  tx: Prisma.TransactionClient,
  params: ConfirmPaymentParams,
): Promise<{ payment: ManualPayment; ledgerEntry: LedgerEntry }> {
  if (
    params.creditsPerBaisa <= 0n ||
    params.creditsPerBaisa > MAX_SIGNED_BIGINT
  ) {
    throw new PaymentDomainError(
      "INVALID_CREDIT_RATE",
      "Credits per baisa must be a positive signed 64-bit integer.",
    );
  }

  await tx.$queryRaw`SELECT id FROM ManualPayment WHERE id = ${params.paymentId} AND organizationId = ${params.organizationId} FOR UPDATE`;

  const payment = await tx.manualPayment.findUnique({
    where: {
      id: params.paymentId,
      organizationId: params.organizationId,
    },
  });

  if (!payment) {
    throw new PaymentNotFoundError(params.paymentId);
  }

  if (payment.status === "CONFIRMED") {
    if (payment.ledgerEntryId) {
      const existingEntry = await tx.ledgerEntry.findUnique({
        where: { id: payment.ledgerEntryId },
      });
      if (
        existingEntry &&
        existingEntry.idempotencyKey === params.idempotencyKey
      ) {
        return { payment, ledgerEntry: existingEntry };
      }
    }
    throw new PaymentAlreadySettledError(params.paymentId);
  }

  if (payment.status !== "DRAFT" && payment.status !== "PENDING") {
    throw new InvalidPaymentTransitionError(payment.status, "CONFIRMED");
  }

  if (payment.amountBaisa > MAX_SIGNED_BIGINT / params.creditsPerBaisa) {
    throw new PaymentDomainError(
      "CREDIT_GRANT_OVERFLOW",
      "The calculated credit grant exceeds the supported ledger range.",
    );
  }

  const creditsGranted = payment.amountBaisa * params.creditsPerBaisa;

  const wallet = await tx.wallet.upsert({
    where: { organizationId: payment.organizationId },
    create: {
      organizationId: payment.organizationId,
      balanceCache: 0n,
      version: 0,
    },
    update: {},
  });

  const ledgerEntry = await grantCredits(tx, {
    walletId: wallet.id,
    amountCredits: creditsGranted,
    type: "PAYMENT_GRANT",
    idempotencyKey: params.idempotencyKey,
    referenceType: "MANUAL_PAYMENT",
    referenceId: payment.id,
    description: "Payment confirmation credit grant",
  });

  const updatedPayment = await tx.manualPayment.update({
    where: { id: payment.id },
    data: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
      confirmedById: params.confirmedById,
      creditsGranted,
      creditsPerBaisa: params.creditsPerBaisa,
      ledgerEntryId: ledgerEntry.id,
    },
  });

  await tx.auditEvent.create({
    data: {
      actorUserId: params.confirmedById,
      organizationId: payment.organizationId,
      action: "payment.confirmed",
      targetType: "ManualPayment",
      targetId: payment.id,
      requestId: params.idempotencyKey,
      metadata: {
        creditsGranted: creditsGranted.toString(),
        creditsPerBaisa: params.creditsPerBaisa.toString(),
      },
    },
  });

  return { payment: updatedPayment, ledgerEntry };
}

export async function _rejectPaymentTx(
  tx: Prisma.TransactionClient,
  params: RejectPaymentParams,
): Promise<ManualPayment> {
  await tx.$queryRaw`SELECT id FROM ManualPayment WHERE id = ${params.paymentId} AND organizationId = ${params.organizationId} FOR UPDATE`;

  const payment = await tx.manualPayment.findUnique({
    where: {
      id: params.paymentId,
      organizationId: params.organizationId,
    },
  });

  if (!payment) {
    throw new PaymentNotFoundError(params.paymentId);
  }

  if (payment.status === "REJECTED") {
    if (
      payment.rejectionIdempotencyKey === params.idempotencyKey &&
      payment.rejectionReason === params.reason
    ) {
      return payment;
    }
    throw new PaymentAlreadySettledError(params.paymentId);
  }

  if (payment.status !== "PENDING") {
    throw new InvalidPaymentTransitionError(payment.status, "REJECTED");
  }

  const reusedKey = await tx.manualPayment.findUnique({
    where: { rejectionIdempotencyKey: params.idempotencyKey },
    select: { id: true },
  });
  if (reusedKey && reusedKey.id !== payment.id) {
    throw new IdempotencyConflictError(
      params.idempotencyKey,
      "Rejection key was already used for another payment",
    );
  }

  const updated = await tx.manualPayment.update({
    where: { id: payment.id },
    data: {
      status: "REJECTED",
      rejectedAt: new Date(),
      rejectionReason: params.reason,
      rejectionIdempotencyKey: params.idempotencyKey,
    },
  });

  await tx.auditEvent.create({
    data: {
      actorUserId: params.actorUserId,
      organizationId: payment.organizationId,
      action: "payment.rejected",
      targetType: "ManualPayment",
      targetId: payment.id,
      requestId: params.idempotencyKey,
      metadata: {
        reason: params.reason,
      },
    },
  });

  return updated;
}

export async function _reversePaymentTx(
  tx: Prisma.TransactionClient,
  params: ReversePaymentParams,
): Promise<{ payment: ManualPayment; ledgerEntry: LedgerEntry }> {
  await tx.$queryRaw`SELECT id FROM ManualPayment WHERE id = ${params.paymentId} AND organizationId = ${params.organizationId} FOR UPDATE`;

  const payment = await tx.manualPayment.findUnique({
    where: {
      id: params.paymentId,
      organizationId: params.organizationId,
    },
  });

  if (!payment) {
    throw new PaymentNotFoundError(params.paymentId);
  }

  if (payment.status === "REVERSED") {
    if (payment.ledgerEntryId) {
      const existingReversal = await tx.ledgerEntry.findFirst({
        where: { reversalOfId: payment.ledgerEntryId },
      });
      if (
        existingReversal &&
        existingReversal.idempotencyKey === params.idempotencyKey
      ) {
        return { payment, ledgerEntry: existingReversal };
      }
    }
    throw new PaymentAlreadySettledError(params.paymentId);
  }

  if (payment.status !== "CONFIRMED") {
    throw new InvalidPaymentTransitionError(payment.status, "REVERSED");
  }

  const creditsToDeduct = payment.creditsGranted;
  if (creditsToDeduct === null || creditsToDeduct === undefined) {
    throw new PaymentDomainError(
      "INVALID_PAYMENT_STATE",
      "Payment does not have creditsGranted recorded.",
    );
  }

  const wallet = await tx.wallet.findUnique({
    where: { organizationId: payment.organizationId },
  });
  if (!wallet) {
    throw new PaymentDomainError(
      "WALLET_NOT_FOUND",
      `Wallet for organization ${payment.organizationId} not found`,
    );
  }

  await tx.$queryRaw`SELECT id FROM Wallet WHERE id = ${wallet.id} FOR UPDATE`;

  const freshWallet = await tx.wallet.findUniqueOrThrow({
    where: { id: wallet.id },
  });

  if (freshWallet.balanceCache < creditsToDeduct) {
    throw new InsufficientCreditsError(
      freshWallet.balanceCache,
      creditsToDeduct,
    );
  }

  const balanceAfter = freshWallet.balanceCache - creditsToDeduct;

  const ledgerEntry = await tx.ledgerEntry.create({
    data: {
      walletId: freshWallet.id,
      type: "REVERSAL",
      amountCredits: creditsToDeduct,
      balanceAfter,
      idempotencyKey: params.idempotencyKey,
      referenceType: "MANUAL_PAYMENT",
      referenceId: payment.id,
      reversalOfId: payment.ledgerEntryId ?? null,
      description: params.reason,
    },
  });

  await tx.wallet.update({
    where: { id: freshWallet.id },
    data: {
      balanceCache: balanceAfter,
      version: { increment: 1 },
    },
  });

  const updatedPayment = await tx.manualPayment.update({
    where: { id: payment.id },
    data: {
      status: "REVERSED",
      reversedAt: new Date(),
      reversalReason: params.reason,
    },
  });

  await tx.auditEvent.create({
    data: {
      actorUserId: params.actorUserId,
      organizationId: payment.organizationId,
      action: "payment.reversed",
      targetType: "ManualPayment",
      targetId: payment.id,
      requestId: params.idempotencyKey,
      metadata: {
        reason: params.reason,
        creditsDeducted: creditsToDeduct.toString(),
      },
    },
  });

  return { payment: updatedPayment, ledgerEntry };
}

export async function _grantAdminCreditsTx(
  tx: Prisma.TransactionClient,
  params: GrantAdminCreditsParams,
): Promise<LedgerEntry> {
  const wallet = await tx.wallet.upsert({
    where: { organizationId: params.organizationId },
    create: {
      organizationId: params.organizationId,
      balanceCache: 0n,
      version: 0,
    },
    update: {},
  });

  const existing = await tx.ledgerEntry.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
  });

  if (existing) {
    if (
      existing.walletId === wallet.id &&
      existing.amountCredits === params.amountCredits &&
      existing.type === "ADMIN_GRANT" &&
      existing.description === params.reason
    ) {
      return existing;
    }
    throw new IdempotencyConflictError(
      params.idempotencyKey,
      "Existing grant entry does not match organization or parameters",
    );
  }

  const ledgerEntry = await grantCredits(tx, {
    walletId: wallet.id,
    amountCredits: params.amountCredits,
    type: "ADMIN_GRANT",
    idempotencyKey: params.idempotencyKey,
    description: params.reason,
  });

  await tx.auditEvent.create({
    data: {
      actorUserId: params.actorUserId,
      organizationId: params.organizationId,
      action: "payment.admin_credit_granted",
      targetType: "LedgerEntry",
      targetId: ledgerEntry.id,
      requestId: params.idempotencyKey,
      metadata: {
        amountCredits: params.amountCredits.toString(),
        reason: params.reason,
      },
    },
  });

  return ledgerEntry;
}

// ---------------------------------------------------------------------------
// Public Domain API (Wraps in Serializable Transaction)
// ---------------------------------------------------------------------------

export async function recordPayment(
  params: RecordPaymentParams,
): Promise<ManualPayment> {
  return db.$transaction((tx) => _recordPaymentTx(tx, params), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

export async function confirmPayment(
  params: ConfirmPaymentParams,
): Promise<{ payment: ManualPayment; ledgerEntry: LedgerEntry }> {
  return db.$transaction((tx) => _confirmPaymentTx(tx, params), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

export async function rejectPayment(
  params: RejectPaymentParams,
): Promise<ManualPayment> {
  return db.$transaction((tx) => _rejectPaymentTx(tx, params), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

export async function reversePayment(
  params: ReversePaymentParams,
): Promise<{ payment: ManualPayment; ledgerEntry: LedgerEntry }> {
  return db.$transaction((tx) => _reversePaymentTx(tx, params), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

export async function grantAdminCredits(
  params: GrantAdminCreditsParams,
): Promise<LedgerEntry> {
  return db.$transaction((tx) => _grantAdminCreditsTx(tx, params), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}
