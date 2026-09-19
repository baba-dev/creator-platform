import { hasPlatformPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { requirePlatformPermission } from "@/lib/request-auth";
import {
  formatBaisa,
  formatCredits,
  formatMuscatDate,
  formatMuscatDateTime,
} from "@/lib/format-baisa";
import {
  ConfirmPaymentForm,
  RejectPaymentForm,
  ReversePaymentForm,
} from "@/components/admin/payment-actions";

function isPositiveLedgerEntry(type: string): boolean {
  return ["PAYMENT_GRANT", "ADMIN_GRANT", "RELEASE", "REFUND"].includes(type);
}

function PaymentStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    DRAFT: "bg-muted text-muted-foreground border-border",
    PENDING: "bg-warning/15 text-warning-foreground border-warning/30",
    CONFIRMED: "bg-success/15 text-success border-success/30",
    REJECTED: "bg-destructive/15 text-destructive border-destructive/30",
    REVERSED: "bg-muted text-muted-foreground border-border",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? "bg-muted text-muted-foreground border-border"}`}
    >
      {status}
    </span>
  );
}

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string; paymentId: string }>;
}) {
  const session = await requirePlatformPermission("payments:read");
  const { organizationId, paymentId } = await params;

  const canManage = hasPlatformPermission(
    session.user.platformRole,
    "payments:manage",
  );

  const payment = await db.manualPayment.findUnique({
    where: { id: paymentId, organizationId },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      confirmedBy: { select: { id: true, name: true, email: true } },
    },
  });

  if (!payment) notFound();

  const [ledgerEntry, wallet, auditEvents] = await Promise.all([
    payment.ledgerEntryId
      ? db.ledgerEntry.findUnique({
          where: { id: payment.ledgerEntryId },
          include: { reversedBy: true },
        })
      : null,
    db.wallet.findUnique({
      where: { organizationId },
      select: { balanceCache: true },
    }),
    db.auditEvent.findMany({
      where: {
        organizationId,
        targetType: "ManualPayment",
        targetId: payment.id,
      },
      include: {
        actor: { select: { name: true, email: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);
  const ledgerEntries = ledgerEntry
    ? [ledgerEntry, ...(ledgerEntry.reversedBy ? [ledgerEntry.reversedBy] : [])]
    : [];

  return (
    <main className="px-4 py-7 sm:px-7 lg:px-9">
      <Link
        href={`/admin/organizations/${organizationId}/payments` as Route}
        className="inline-flex min-h-10 items-center text-sm font-semibold text-primary hover:underline"
      >
        ← Back to payments
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-display text-2xl font-semibold">
              Payment details
            </h2>
            <PaymentStatusBadge status={payment.status} />
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {payment.id}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Payment details card */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="font-display text-lg font-semibold">
            Transaction overview
          </h3>
          <dl className="mt-4 divide-y divide-border text-sm">
            <div className="flex justify-between py-3">
              <dt className="text-muted-foreground">Amount</dt>
              <dd className="tabular-nums font-semibold text-foreground">
                {formatBaisa(payment.amountBaisa)}
              </dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-muted-foreground">Method</dt>
              <dd className="font-medium text-foreground">{payment.method}</dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <PaymentStatusBadge status={payment.status} />
              </dd>
            </div>
            {payment.reference && (
              <div className="flex justify-between py-3">
                <dt className="text-muted-foreground">Reference</dt>
                <dd className="font-mono text-foreground">
                  {payment.reference}
                </dd>
              </div>
            )}
            {payment.chequeNumber && (
              <div className="flex justify-between py-3">
                <dt className="text-muted-foreground">Cheque number</dt>
                <dd className="font-mono text-foreground">
                  {payment.chequeNumber}
                </dd>
              </div>
            )}
            {payment.bankName && (
              <div className="flex justify-between py-3">
                <dt className="text-muted-foreground">Bank name</dt>
                <dd className="text-foreground">{payment.bankName}</dd>
              </div>
            )}
            <div className="flex justify-between py-3">
              <dt className="text-muted-foreground">Received date</dt>
              <dd className="tabular-nums text-foreground">
                {formatMuscatDate(payment.receivedAt)}
              </dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-muted-foreground">Recorded by</dt>
              <dd className="text-foreground">
                {payment.createdBy.name} ({payment.createdBy.email})
              </dd>
            </div>
            {payment.confirmedAt && (
              <div className="flex justify-between py-3">
                <dt className="text-muted-foreground">Confirmed date</dt>
                <dd className="tabular-nums text-foreground">
                  {formatMuscatDateTime(payment.confirmedAt)}
                </dd>
              </div>
            )}
            {payment.confirmedBy && (
              <div className="flex justify-between py-3">
                <dt className="text-muted-foreground">Confirmed by</dt>
                <dd className="text-foreground">
                  {payment.confirmedBy.name} ({payment.confirmedBy.email})
                </dd>
              </div>
            )}
            {payment.creditsGranted !== null && (
              <div className="flex justify-between py-3">
                <dt className="text-muted-foreground">
                  Credits granted snapshot
                </dt>
                <dd className="tabular-nums font-semibold text-success">
                  {formatCredits(payment.creditsGranted)}
                </dd>
              </div>
            )}
            {payment.creditsPerBaisa !== null && (
              <div className="flex justify-between py-3">
                <dt className="text-muted-foreground">
                  Conversion rate snapshot
                </dt>
                <dd className="tabular-nums text-foreground">
                  {payment.creditsPerBaisa.toString()} credit / baisa
                </dd>
              </div>
            )}
            {payment.rejectionReason && (
              <div className="flex flex-col py-3">
                <dt className="text-muted-foreground">Rejection reason</dt>
                <dd className="mt-1 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">
                  {payment.rejectionReason}
                </dd>
              </div>
            )}
            {payment.reversalReason && (
              <div className="flex flex-col py-3">
                <dt className="text-muted-foreground">Reversal reason</dt>
                <dd className="mt-1 rounded-lg border border-border bg-muted/40 p-3 text-muted-foreground">
                  {payment.reversalReason}
                </dd>
              </div>
            )}
            {payment.notes && (
              <div className="flex flex-col py-3">
                <dt className="text-muted-foreground">Internal notes</dt>
                <dd className="mt-1 text-foreground">{payment.notes}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Actions card */}
        <div className="flex flex-col gap-6">
          {canManage && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h3 className="font-display text-lg font-semibold">
                Payment actions
              </h3>

              {(payment.status === "DRAFT" || payment.status === "PENDING") && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-foreground">
                    Confirm payment & grant credits
                  </h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Grants platform credits to the organization wallet and marks
                    payment CONFIRMED.
                  </p>
                  <div className="mt-3">
                    <ConfirmPaymentForm
                      paymentId={payment.id}
                      organizationId={organizationId}
                      amountBaisa={payment.amountBaisa.toString()}
                    />
                  </div>
                </div>
              )}

              {payment.status === "PENDING" && (
                <div className="mt-6 border-t border-border pt-6">
                  <h4 className="text-sm font-medium text-destructive">
                    Reject cheque payment
                  </h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Rejects this pending cheque. No credits will be granted.
                  </p>
                  <div className="mt-3">
                    <RejectPaymentForm
                      paymentId={payment.id}
                      organizationId={organizationId}
                    />
                  </div>
                </div>
              )}

              {payment.status === "CONFIRMED" && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-destructive">
                    Reverse confirmed payment
                  </h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Creates a reversal ledger entry, deducts granted credits,
                    and marks payment REVERSED.
                  </p>
                  <div className="mt-3">
                    <ReversePaymentForm
                      paymentId={payment.id}
                      organizationId={organizationId}
                      creditsGranted={payment.creditsGranted?.toString() ?? "0"}
                      walletBalance={wallet?.balanceCache.toString() ?? "0"}
                    />
                  </div>
                </div>
              )}

              {(payment.status === "REJECTED" ||
                payment.status === "REVERSED") && (
                <p className="mt-4 text-sm text-muted-foreground">
                  This payment has been settled ({payment.status.toLowerCase()}
                  ). No further actions can be taken.
                </p>
              )}
            </div>
          )}

          {ledgerEntries.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h3 className="font-display text-lg font-semibold">
                Ledger trail
              </h3>
              <div className="mt-4 space-y-4">
                {ledgerEntries.map((entry) => {
                  const positive = isPositiveLedgerEntry(entry.type);
                  return (
                    <dl
                      key={entry.id}
                      className="divide-y divide-border rounded-lg border border-border p-4 text-sm"
                    >
                      <div className="flex justify-between gap-4 py-2">
                        <dt className="text-muted-foreground">Entry ID</dt>
                        <dd className="break-all font-mono text-xs text-foreground">
                          {entry.id}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4 py-2">
                        <dt className="text-muted-foreground">Type</dt>
                        <dd
                          className={
                            positive
                              ? "font-medium text-success"
                              : "font-medium text-destructive"
                          }
                        >
                          {entry.type}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4 py-2">
                        <dt className="text-muted-foreground">Amount credits</dt>
                        <dd
                          className={
                            positive
                              ? "tabular-nums font-semibold text-success"
                              : "tabular-nums font-semibold text-destructive"
                          }
                        >
                          {positive ? "+" : "−"}
                          {formatCredits(entry.amountCredits)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4 py-2">
                        <dt className="text-muted-foreground">Balance after</dt>
                        <dd className="tabular-nums text-foreground">
                          {formatCredits(entry.balanceAfter)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4 py-2">
                        <dt className="text-muted-foreground">
                          Timestamp (Muscat)
                        </dt>
                        <dd className="tabular-nums text-muted-foreground">
                          {formatMuscatDateTime(entry.createdAt)}
                        </dd>
                      </div>
                    </dl>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="font-display text-lg font-semibold">
              Audit timeline
            </h3>
            {auditEvents.length > 0 ? (
              <ol className="mt-4 space-y-4 border-l border-border pl-5">
                {auditEvents.map((event) => (
                  <li key={event.id} className="relative">
                    <span className="absolute -left-[1.58rem] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                    <p className="text-sm font-semibold text-foreground">
                      {event.action}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {event.actor
                        ? `${event.actor.name} (${event.actor.email})`
                        : "System"}
                    </p>
                    <time className="mt-1 block text-xs tabular-nums text-muted-foreground">
                      {formatMuscatDateTime(event.createdAt)}
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                No audit events were recorded for this payment.
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
