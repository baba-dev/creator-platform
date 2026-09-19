import {
  IdempotencyConflictError,
  InsufficientCreditsError,
  InvalidPaymentTransitionError,
  PaymentAlreadySettledError,
  PaymentDomainError,
  PaymentNotFoundError,
} from "@aiwa/payments";
import type { LedgerEntry, ManualPayment } from "@aiwa/db";
import { NextResponse } from "next/server";

export function serializePayment(payment: ManualPayment) {
  return {
    ...payment,
    idempotencyKey: undefined,
    rejectionIdempotencyKey: undefined,
    amountBaisa: payment.amountBaisa.toString(),
    creditsGranted:
      payment.creditsGranted !== null
        ? payment.creditsGranted.toString()
        : null,
    creditsPerBaisa:
      payment.creditsPerBaisa !== null
        ? payment.creditsPerBaisa.toString()
        : null,
  };
}

export function serializeLedgerEntry(entry: LedgerEntry) {
  return {
    ...entry,
    amountCredits: entry.amountCredits.toString(),
    balanceAfter: entry.balanceAfter.toString(),
  };
}

export function paymentError(error: unknown) {
  if (error instanceof PaymentNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (
    error instanceof IdempotencyConflictError ||
    error instanceof PaymentAlreadySettledError
  ) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (
    error instanceof InvalidPaymentTransitionError ||
    error instanceof InsufficientCreditsError
  ) {
    return NextResponse.json({ error: error.message }, { status: 422 });
  }
  if (error instanceof PaymentDomainError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(
    { error: "Internal server error." },
    { status: 500 },
  );
}
