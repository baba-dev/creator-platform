"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@aiwa/ui";
import { formatBaisa, formatCredits } from "@/lib/format-baisa";

interface RecordPaymentDialogProps {
  organizationId: string;
}

export function RecordPaymentDialog({
  organizationId,
}: RecordPaymentDialogProps) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<"CASH" | "CHEQUE">("CASH");
  const [amountBaisa, setAmountBaisa] = useState("");
  const [receivedAt, setReceivedAt] = useState(
    new Date().toISOString().slice(0, 16),
  );
  const [reference, setReference] = useState("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const resetForm = () => {
    setMethod("CASH");
    setAmountBaisa("");
    setReceivedAt(new Date().toISOString().slice(0, 16));
    setReference("");
    setChequeNumber("");
    setBankName("");
    setNotes("");
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const baisaVal = BigInt(amountBaisa || "0");
    if (baisaVal <= 0n) {
      setError("Amount must be greater than 0 baisa.");
      return;
    }

    startTransition(async () => {
      try {
        const idempotencyKey = crypto.randomUUID();
        const res = await fetch(
          `/api/admin/organizations/${organizationId}/payments`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              method,
              amountBaisa: baisaVal.toString(),
              receivedAt: new Date(receivedAt).toISOString(),
              reference: reference.trim() || undefined,
              chequeNumber:
                method === "CHEQUE"
                  ? chequeNumber.trim() || undefined
                  : undefined,
              bankName:
                method === "CHEQUE" ? bankName.trim() || undefined : undefined,
              notes: notes.trim() || undefined,
              idempotencyKey,
            }),
          },
        );

        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to record payment.");
          return;
        }

        setOpen(false);
        resetForm();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      }
    });
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="min-h-10 px-4 text-sm font-medium"
      >
        Record Payment
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="font-display text-lg font-semibold text-card-foreground">
                Record Manual Payment
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-muted-foreground">
                  Payment Method
                </label>
                <div className="mt-1.5 flex gap-4">
                  <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-foreground">
                    <input
                      type="radio"
                      name="method"
                      value="CASH"
                      checked={method === "CASH"}
                      onChange={() => setMethod("CASH")}
                      className="accent-primary"
                    />
                    Cash (Immediate)
                  </label>
                  <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-foreground">
                    <input
                      type="radio"
                      name="method"
                      value="CHEQUE"
                      checked={method === "CHEQUE"}
                      onChange={() => setMethod("CHEQUE")}
                      className="accent-primary"
                    />
                    Cheque (Pending verification)
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground">
                  Amount in Baisa (1,000 baisa = 1.000 OMR)
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="1"
                  value={amountBaisa}
                  onChange={(e) => setAmountBaisa(e.target.value)}
                  placeholder="e.g. 5000 for 5.000 OMR"
                  className="mt-1 w-full min-h-10 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground tabular-nums placeholder:text-muted-foreground/60 focus:border-ring focus:outline-hidden"
                />
                {amountBaisa && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Equivalent:{" "}
                    <span className="font-semibold text-foreground tabular-nums">
                      {formatBaisa(BigInt(amountBaisa || "0"))}
                    </span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground">
                  Received At
                </label>
                <input
                  type="datetime-local"
                  required
                  value={receivedAt}
                  onChange={(e) => setReceivedAt(e.target.value)}
                  className="mt-1 w-full min-h-10 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground tabular-nums focus:border-ring focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground">
                  Internal / Receipt Reference (Optional)
                </label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. REC-2026-001"
                  className="mt-1 w-full min-h-10 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-hidden"
                />
              </div>

              {method === "CHEQUE" && (
                <div className="space-y-4 rounded-md border border-border bg-accent/20 p-3">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground">
                      Cheque Number
                    </label>
                    <input
                      type="text"
                      required
                      value={chequeNumber}
                      onChange={(e) => setChequeNumber(e.target.value)}
                      placeholder="e.g. 004921"
                      className="mt-1 w-full min-h-10 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground tabular-nums focus:border-ring focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      required
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="e.g. Bank Muscat, Bank Dhofar"
                      className="mt-1 w-full min-h-10 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-hidden"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-muted-foreground">
                  Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional context or billing memo..."
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setOpen(false)}
                  disabled={isPending}
                  className="min-h-10 px-4 text-sm"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="min-h-10 px-4 text-sm"
                >
                  {isPending ? "Recording..." : "Record Payment"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

interface ConfirmPaymentFormProps {
  organizationId: string;
  paymentId: string;
  amountBaisa: string;
}

export function ConfirmPaymentForm({
  organizationId,
  paymentId,
  amountBaisa,
}: ConfirmPaymentFormProps) {
  const [creditsPerBaisa, setCreditsPerBaisa] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const parsedAmountBaisa = BigInt(amountBaisa || "0");
  const rate = BigInt(creditsPerBaisa || "1");
  const previewCredits = parsedAmountBaisa * (rate > 0n ? rate : 1n);

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (rate <= 0n) {
      setError("Credits per baisa rate must be at least 1.");
      return;
    }

    startTransition(async () => {
      try {
        const idempotencyKey = crypto.randomUUID();
        const res = await fetch(
          `/api/admin/organizations/${organizationId}/payments/${paymentId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "confirm",
              creditsPerBaisa: rate.toString(),
              idempotencyKey,
            }),
          },
        );

        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to confirm payment.");
          return;
        }

        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      }
    });
  };

  return (
    <form
      onSubmit={handleConfirm}
      className="space-y-4 rounded-lg border border-border bg-card p-4"
    >
      <div>
        <h3 className="font-display text-base font-semibold text-card-foreground">
          Confirm Payment & Grant Credits
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Locks in the conversion rate snapshot and creates an atomic
          PAYMENT_GRANT ledger entry.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-muted-foreground">
          Credits per 1 Baisa
        </label>
        <div className="mt-1 flex items-center gap-3">
          <input
            type="number"
            required
            min="1"
            step="1"
            value={creditsPerBaisa}
            onChange={(e) => setCreditsPerBaisa(e.target.value)}
            className="w-36 min-h-10 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground tabular-nums focus:border-ring focus:outline-hidden"
          />
          <div className="text-sm text-muted-foreground">
            Credits granted:{" "}
            <span className="font-bold text-foreground tabular-nums">
              {formatCredits(previewCredits)} credits
            </span>
          </div>
        </div>
      </div>

      <div className="pt-2">
        <Button
          type="submit"
          disabled={isPending}
          className="min-h-10 px-4 text-sm font-semibold"
        >
          {isPending ? "Confirming..." : "Confirm & Grant Credits"}
        </Button>
      </div>
    </form>
  );
}

interface RejectPaymentFormProps {
  organizationId: string;
  paymentId: string;
}

export function RejectPaymentForm({
  organizationId,
  paymentId,
}: RejectPaymentFormProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleReject = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (reason.trim().length < 3) {
      setError("Rejection reason must be at least 3 characters.");
      return;
    }

    startTransition(async () => {
      try {
        const idempotencyKey = crypto.randomUUID();
        const res = await fetch(
          `/api/admin/organizations/${organizationId}/payments/${paymentId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "reject",
              reason: reason.trim(),
              idempotencyKey,
            }),
          },
        );

        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to reject payment.");
          return;
        }

        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      }
    });
  };

  return (
    <form
      onSubmit={handleReject}
      className="space-y-4 rounded-lg border border-destructive/20 bg-destructive/5 p-4"
    >
      <div>
        <h3 className="font-display text-base font-semibold text-destructive">
          Reject Pending Cheque
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Marks the cheque payment as rejected. No credits will be granted.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-muted-foreground">
          Reason for Rejection (Required)
        </label>
        <textarea
          required
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Bounced cheque, signature mismatch..."
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-hidden"
        />
      </div>

      <div className="pt-2">
        <Button
          type="submit"
          variant="destructive"
          disabled={isPending}
          className="min-h-10 px-4 text-sm font-semibold"
        >
          {isPending ? "Rejecting..." : "Reject Cheque Payment"}
        </Button>
      </div>
    </form>
  );
}

interface ReversePaymentFormProps {
  organizationId: string;
  paymentId: string;
  creditsGranted: string;
  walletBalance?: string;
}

export function ReversePaymentForm({
  organizationId,
  paymentId,
  creditsGranted,
  walletBalance,
}: ReversePaymentFormProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const creditsVal = BigInt(creditsGranted || "0");
  const balanceVal = walletBalance !== undefined ? BigInt(walletBalance) : null;
  const isBalanceSufficient = balanceVal === null || balanceVal >= creditsVal;

  const handleReverse = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (reason.trim().length < 5) {
      setError("Reversal reason must be at least 5 characters.");
      return;
    }

    startTransition(async () => {
      try {
        const idempotencyKey = crypto.randomUUID();
        const res = await fetch(
          `/api/admin/organizations/${organizationId}/payments/${paymentId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "reverse",
              reason: reason.trim(),
              idempotencyKey,
            }),
          },
        );

        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to reverse payment.");
          return;
        }

        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      }
    });
  };

  return (
    <>
      <Button
        variant="destructive"
        onClick={() => setOpen(true)}
        className="min-h-10 px-4 text-sm font-semibold"
      >
        Reverse Confirmed Payment
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="font-display text-lg font-semibold text-destructive">
                Reverse Confirmed Payment
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleReverse} className="mt-4 space-y-4">
              <div className="rounded-md border border-border bg-accent/30 p-3 text-xs text-muted-foreground space-y-1">
                <p>
                  Credits to deduct:{" "}
                  <span className="font-bold text-destructive tabular-nums">
                    -{formatCredits(creditsVal)} credits
                  </span>
                </p>
                {balanceVal !== null && (
                  <p>
                    Current wallet balance:{" "}
                    <span className="font-bold text-foreground tabular-nums">
                      {formatCredits(balanceVal)} credits
                    </span>
                  </p>
                )}
                {!isBalanceSufficient && (
                  <p className="font-semibold text-destructive">
                    Warning: Current wallet balance is less than credits
                    granted. Reversal will be blocked.
                  </p>
                )}
              </div>

              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-muted-foreground">
                  Reason for Reversal (Required)
                </label>
                <textarea
                  required
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain why this settled payment is being reversed..."
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setOpen(false)}
                  disabled={isPending}
                  className="min-h-10 px-4 text-sm"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={isPending || !isBalanceSufficient}
                  className="min-h-10 px-4 text-sm"
                >
                  {isPending ? "Reversing..." : "Confirm Reversal"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

interface GrantCreditsDialogProps {
  organizationId: string;
}

export function GrantCreditsDialog({
  organizationId,
}: GrantCreditsDialogProps) {
  const [open, setOpen] = useState(false);
  const [amountCredits, setAmountCredits] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleGrant = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const creditsVal = BigInt(amountCredits || "0");
    if (creditsVal <= 0n) {
      setError("Grant amount must be greater than 0.");
      return;
    }

    if (reason.trim().length < 5) {
      setError("Reason must be at least 5 characters.");
      return;
    }

    startTransition(async () => {
      try {
        const idempotencyKey = crypto.randomUUID();
        const res = await fetch(
          `/api/admin/organizations/${organizationId}/wallet/credits`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              amountCredits: creditsVal.toString(),
              reason: reason.trim(),
              idempotencyKey,
            }),
          },
        );

        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to grant promotional credits.");
          return;
        }

        setOpen(false);
        setAmountCredits("");
        setReason("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      }
    });
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="min-h-10 px-4 text-sm font-medium"
      >
        Grant Credits
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="font-display text-lg font-semibold text-card-foreground">
                Grant Promotional / Internal Credits
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGrant} className="mt-4 space-y-4">
              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-muted-foreground">
                  Credits to Grant
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="1"
                  value={amountCredits}
                  onChange={(e) => setAmountCredits(e.target.value)}
                  placeholder="e.g. 5000"
                  className="mt-1 w-full min-h-10 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground tabular-nums placeholder:text-muted-foreground/60 focus:border-ring focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground">
                  Reason / Purpose (Required)
                </label>
                <textarea
                  required
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Marketing welcome package, goodwill compensation..."
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setOpen(false)}
                  disabled={isPending}
                  className="min-h-10 px-4 text-sm"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="min-h-10 px-4 text-sm"
                >
                  {isPending ? "Granting..." : "Grant Credits"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
