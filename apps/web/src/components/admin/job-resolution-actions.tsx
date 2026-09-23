"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/admin/primitives";
import { Tape } from "@/components/ui/sketch";

interface JobResolutionActionsProps {
  jobId: string;
  status: string;
  reservedCredits: string;
  chargedCredits: string;
  providerRequestId?: string | null;
  outputUrl?: string | null;
  mediaKind: string;
  canManage: boolean;
  permittedActions: {
    canReconcile: boolean;
    reconcileReason?: string;
    canRecover: boolean;
    recoverReason?: string;
    canRelease: boolean;
    releaseReason?: string;
    canRefund: boolean;
    refundReason?: string;
  };
}

export function JobResolutionActions({
  jobId,
  status,
  reservedCredits,
  chargedCredits,
  providerRequestId,
  outputUrl,
  mediaKind,
  canManage,
  permittedActions,
}: JobResolutionActionsProps) {
  const router = useRouter();
  const [activeDialog, setActiveDialog] = useState<
    "reconcile" | "recover" | "release" | "refund" | null
  >(null);

  // Live provider check state
  const [liveCheckLoading, setLiveCheckLoading] = useState(false);
  const [liveCheckResult, setLiveCheckResult] = useState<{
    status?: string;
    outputUrls?: string[];
    errorCode?: string;
    error?: string;
  } | null>(null);

  // Form states
  const [reconcileOutcome, setReconcileOutcome] = useState<
    "SUCCEEDED" | "FAILED" | "CANCELLED" | "NOT_SUBMITTED"
  >("FAILED");
  const [reconcileEvidence, setReconcileEvidence] = useState("");
  const [reconcileProviderReqId, setReconcileProviderReqId] = useState(
    providerRequestId ?? "",
  );
  const [reconcileCostMicroUsd, setReconcileCostMicroUsd] = useState("");
  const [reconcileNotes, setReconcileNotes] = useState("");

  const [recoverUrl, setRecoverUrl] = useState(outputUrl ?? "");
  const [recoverMode, setRecoverMode] = useState<
    "immediate" | "resume_processing"
  >("immediate");
  const [recoverReason, setRecoverReason] = useState("");

  const [releaseEvidence, setReleaseEvidence] = useState("");
  const [releaseReason, setReleaseReason] = useState("");

  const [refundAmount, setRefundAmount] = useState(chargedCredits);
  const [refundReason, setRefundReason] = useState("");

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const getNewIdempotencyKey = () => {
    idempotencyKeyRef.current = crypto.randomUUID();
    return idempotencyKeyRef.current;
  };

  const handleCheckLiveProvider = async () => {
    setLiveCheckLoading(true);
    setLiveCheckResult(null);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/provider-status`);
      const data = await res.json();
      if (!res.ok) {
        setLiveCheckResult({
          error: data.error ?? "Failed to query provider.",
        });
      } else {
        setLiveCheckResult(data);
        if (data.status === "succeeded") {
          setReconcileOutcome("SUCCEEDED");
          if (data.outputUrls?.[0]) {
            setRecoverUrl(data.outputUrls[0]);
          }
        } else if (data.status === "failed") {
          setReconcileOutcome("FAILED");
        }
      }
    } catch {
      setLiveCheckResult({ error: "Network error querying provider." });
    } finally {
      setLiveCheckLoading(false);
    }
  };

  const submitAction = async (payload: Record<string, unknown>) => {
    setActionError(null);
    setActionSuccess(null);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/jobs/${jobId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok) {
          setActionError(data.error ?? "Action failed.");
          return;
        }

        setActionSuccess(data.message ?? "Action completed successfully.");
        setActiveDialog(null);
        getNewIdempotencyKey();
        router.refresh();
      } catch (err) {
        setActionError(
          err instanceof Error
            ? err.message
            : "Network error executing action.",
        );
      }
    });
  };

  return (
    <div className="relative mt-8 rounded-3xl border border-border bg-card p-6 shadow-sm">
      <Tape className="-top-3 right-8" />
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl font-bold tracking-tight">
              Administrative Resolution Hub
            </h2>
            <StatusBadge
              tone={status === "MANUAL_REVIEW" ? "warning" : "neutral"}
            >
              {status}
            </StatusBadge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Explicit permitted actions for reconciling held-credit jobs,
            recovering outputs, and releasing reservations.
          </p>
        </div>
        {!canManage ? (
          <span className="inline-flex items-center rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">
            Read-only mode (requires jobs:manage)
          </span>
        ) : null}
      </div>

      {actionSuccess ? (
        <div className="mt-4 rounded-xl border border-success/30 bg-success/10 p-4 text-sm font-medium text-success">
          {actionSuccess}
        </div>
      ) : null}

      {actionError ? (
        <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-medium text-destructive">
          {actionError}
        </div>
      ) : null}

      {/* Action Cards Grid */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* 1. Reconcile Provider Outcome */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-background p-5">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-foreground">
                1. Reconcile Provider Outcome
              </span>
              <StatusBadge
                tone={permittedActions.canReconcile ? "info" : "neutral"}
              >
                {permittedActions.canReconcile ? "Available" : "Unavailable"}
              </StatusBadge>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Document verified provider outcome, ticket reference, or console
              logs. Necessary to establish whether a provider charge occurred.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={
                !canManage || !permittedActions.canReconcile || isPending
              }
              onClick={() => {
                setActionError(null);
                setActiveDialog("reconcile");
              }}
            >
              Reconcile Provider
            </Button>
            {mediaKind === "VIDEO" && providerRequestId ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={liveCheckLoading || isPending}
                onClick={handleCheckLiveProvider}
              >
                {liveCheckLoading ? "Querying..." : "Check Live Task"}
              </Button>
            ) : null}
          </div>
          {liveCheckResult ? (
            <div className="mt-3 rounded-lg border border-border bg-card p-3 text-xs">
              {liveCheckResult.error ? (
                <p className="text-destructive font-medium">
                  {liveCheckResult.error}
                </p>
              ) : (
                <div className="space-y-1">
                  <p>
                    <span className="font-semibold text-muted-foreground">
                      Provider Status:
                    </span>{" "}
                    <strong className="font-mono uppercase">
                      {liveCheckResult.status}
                    </strong>
                  </p>
                  {liveCheckResult.outputUrls?.length ? (
                    <p className="text-success">Output media URL verified.</p>
                  ) : null}
                  {liveCheckResult.errorCode ? (
                    <p className="text-destructive">
                      Error: {liveCheckResult.errorCode}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* 2. Recover Generated Output */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-background p-5">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-foreground">
                2. Recover Media Output
              </span>
              <StatusBadge
                tone={permittedActions.canRecover ? "success" : "neutral"}
              >
                {permittedActions.canRecover ? "Available" : "Unavailable"}
              </StatusBadge>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {permittedActions.recoverReason}
            </p>
          </div>
          <div className="mt-4">
            <Button
              size="sm"
              variant="secondary"
              disabled={!canManage || !permittedActions.canRecover || isPending}
              onClick={() => {
                setActionError(null);
                setActiveDialog("recover");
              }}
            >
              Recover Output
            </Button>
          </div>
        </div>

        {/* 3. Release Reservation */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-background p-5">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-foreground">
                3. Release Reservation
              </span>
              <StatusBadge
                tone={permittedActions.canRelease ? "warning" : "neutral"}
              >
                {permittedActions.canRelease ? "Available" : "Unavailable"}
              </StatusBadge>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {permittedActions.releaseReason}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Releases {reservedCredits} credits and deletes pending storage
              allocations.
            </p>
          </div>
          <div className="mt-4">
            <Button
              size="sm"
              variant="destructive"
              disabled={!canManage || !permittedActions.canRelease || isPending}
              onClick={() => {
                setActionError(null);
                setActiveDialog("release");
              }}
            >
              Release Reservation
            </Button>
          </div>
        </div>

        {/* 4. Refund Settled Job */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-background p-5">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-foreground">
                4. Refund Settled Job
              </span>
              <StatusBadge
                tone={permittedActions.canRefund ? "warning" : "neutral"}
              >
                {permittedActions.canRefund ? "Available" : "Unavailable"}
              </StatusBadge>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {permittedActions.refundReason}
            </p>
          </div>
          <div className="mt-4">
            <Button
              size="sm"
              variant="secondary"
              disabled={!canManage || !permittedActions.canRefund || isPending}
              onClick={() => {
                setActionError(null);
                setActiveDialog("refund");
              }}
            >
              Issue Refund
            </Button>
          </div>
        </div>
      </div>

      {/* Modal Dialogs */}

      {/* DIALOG 1: Reconcile Provider Outcome */}
      {activeDialog === "reconcile" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-xl">
            <h3 className="font-display text-lg font-bold">
              Reconcile Provider Outcome
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Document verified evidence from BytePlus ModelArk or Seed Speech
              regarding this job.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitAction({
                  action: "reconcile",
                  outcome: reconcileOutcome,
                  evidence: reconcileEvidence.trim(),
                  providerRequestId: reconcileProviderReqId.trim() || undefined,
                  actualProviderCostMicroUsd:
                    reconcileCostMicroUsd.trim() || undefined,
                  notes: reconcileNotes.trim() || undefined,
                  idempotencyKey: idempotencyKeyRef.current,
                });
              }}
              className="mt-4 space-y-4 text-sm"
            >
              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Verified Outcome <span className="text-destructive">*</span>
                </label>
                <select
                  value={reconcileOutcome}
                  onChange={(e) =>
                    setReconcileOutcome(
                      e.target.value as
                        "SUCCEEDED" | "FAILED" | "CANCELLED" | "NOT_SUBMITTED",
                    )
                  }
                  className="mt-1 block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="FAILED">
                    FAILED (Provider rejected or failed task)
                  </option>
                  <option value="CANCELLED">
                    CANCELLED (Provider confirms task cancellation)
                  </option>
                  <option value="NOT_SUBMITTED">
                    NOT_SUBMITTED (Verified request never reached provider; zero
                    cost)
                  </option>
                  <option value="SUCCEEDED">
                    SUCCEEDED (Provider completed generation successfully)
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Evidence Reference <span className="text-destructive">*</span>
                </label>
                <textarea
                  required
                  minLength={5}
                  maxLength={1000}
                  value={reconcileEvidence}
                  onChange={(e) => setReconcileEvidence(e.target.value)}
                  placeholder="e.g. BytePlus support ticket #BP-8812 confirms gateway timeout before compute allocation; zero billing recorded."
                  className="mt-1 block h-20 w-full rounded-xl border border-input bg-background p-3 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground">
                    Provider Request ID
                  </label>
                  <input
                    value={reconcileProviderReqId}
                    onChange={(e) => setReconcileProviderReqId(e.target.value)}
                    placeholder="e.g. req-abc-123"
                    className="mt-1 block w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground">
                    Provider Cost (micro-USD)
                  </label>
                  <input
                    value={reconcileCostMicroUsd}
                    onChange={(e) => setReconcileCostMicroUsd(e.target.value)}
                    placeholder="e.g. 15000"
                    className="mt-1 block w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Operator Notes (Optional)
                </label>
                <input
                  value={reconcileNotes}
                  onChange={(e) => setReconcileNotes(e.target.value)}
                  placeholder="Additional context for audit log"
                  className="mt-1 block w-full rounded-xl border border-input bg-background px-3 py-2 text-xs"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => setActiveDialog(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isPending || reconcileEvidence.trim().length < 5}
                >
                  {isPending ? "Recording..." : "Record Decision"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* DIALOG 2: Recover Output */}
      {activeDialog === "recover" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-xl">
            <h3 className="font-display text-lg font-bold">
              Recover Media Output
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Recover already-generated output from BytePlus storage without
              submitting a new generation task.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitAction({
                  action: "recover",
                  outputUrl: recoverUrl.trim() || undefined,
                  mode: recoverMode,
                  reason: recoverReason.trim(),
                  idempotencyKey: idempotencyKeyRef.current,
                });
              }}
              className="mt-4 space-y-4 text-sm"
            >
              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Recovery Mode
                </label>
                <div className="mt-2 space-y-2">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="radio"
                      name="recoverMode"
                      value="immediate"
                      checked={recoverMode === "immediate"}
                      onChange={() => setRecoverMode("immediate")}
                    />
                    <span>
                      <strong>Immediate Download & Finalize</strong> (Downloads
                      media, stores asset, captures credits, and marks
                      SUCCEEDED)
                    </span>
                  </label>
                  {mediaKind !== "VOICE" &&
                  (mediaKind !== "VIDEO" || providerRequestId) ? (
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="radio"
                        name="recoverMode"
                        value="resume_processing"
                        checked={recoverMode === "resume_processing"}
                        onChange={() => setRecoverMode("resume_processing")}
                      />
                      <span>
                        <strong>Resume Background Storage Recovery</strong>{" "}
                        (Returns job to PROCESSING without resubmitting)
                      </span>
                    </label>
                  ) : null}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Output URL (Optional if present on job)
                </label>
                <input
                  type="url"
                  value={recoverUrl}
                  onChange={(e) => setRecoverUrl(e.target.value)}
                  placeholder="https://ark-acg-ap-southeast-1.tos-ap-southeast-1.volces.com/..."
                  className="mt-1 block w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Reason <span className="text-destructive">*</span>
                </label>
                <textarea
                  required
                  minLength={5}
                  maxLength={1000}
                  value={recoverReason}
                  onChange={(e) => setRecoverReason(e.target.value)}
                  placeholder="e.g. Validated BytePlus output URL from support ticket. Executing storage recovery."
                  className="mt-1 block h-20 w-full rounded-xl border border-input bg-background p-3 text-xs"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => setActiveDialog(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isPending || recoverReason.trim().length < 5}
                >
                  {isPending ? "Recovering..." : "Execute Recovery"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* DIALOG 3: Release Reservation */}
      {activeDialog === "release" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl border border-destructive/30 bg-card p-6 shadow-xl">
            <h3 className="font-display text-lg font-bold text-destructive">
              Release Credit Reservation
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              This action will return {reservedCredits} reserved credits to the
              customer wallet, delete pending storage allocations, and mark the
              job as FAILED.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitAction({
                  action: "release",
                  evidence: releaseEvidence.trim(),
                  reason: releaseReason.trim(),
                  idempotencyKey: idempotencyKeyRef.current,
                });
              }}
              className="mt-4 space-y-4 text-sm"
            >
              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Evidence of No Provider Charge{" "}
                  <span className="text-destructive">*</span>
                </label>
                <textarea
                  required
                  minLength={5}
                  maxLength={1000}
                  value={releaseEvidence}
                  onChange={(e) => setReleaseEvidence(e.target.value)}
                  placeholder="e.g. Confirmed in BytePlus ModelArk console that task failed before billing; zero billable tokens consumed."
                  className="mt-1 block h-20 w-full rounded-xl border border-input bg-background p-3 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Resolution Reason <span className="text-destructive">*</span>
                </label>
                <input
                  required
                  minLength={5}
                  maxLength={1000}
                  value={releaseReason}
                  onChange={(e) => setReleaseReason(e.target.value)}
                  placeholder="e.g. Provider timeout confirmed without charge; released customer reservation."
                  className="mt-1 block w-full rounded-xl border border-input bg-background px-3 py-2 text-xs"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => setActiveDialog(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={
                    isPending ||
                    releaseEvidence.trim().length < 5 ||
                    releaseReason.trim().length < 5
                  }
                >
                  {isPending ? "Releasing..." : "Confirm & Release"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* DIALOG 4: Refund Settled Job */}
      {activeDialog === "refund" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-xl">
            <h3 className="font-display text-lg font-bold">
              Refund Settled Credits
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Create an immutable refund entry in the customer ledger reversing
              captured credits.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitAction({
                  action: "refund",
                  amountCredits: refundAmount ? refundAmount : undefined,
                  reason: refundReason.trim(),
                  idempotencyKey: idempotencyKeyRef.current,
                });
              }}
              className="mt-4 space-y-4 text-sm"
            >
              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Refund Amount (Credits){" "}
                  <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder={`Max ${chargedCredits}`}
                  className="mt-1 block w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-mono"
                />
                <span className="text-[11px] text-muted-foreground">
                  Total settled credits: {chargedCredits}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Documented Reason <span className="text-destructive">*</span>
                </label>
                <textarea
                  required
                  minLength={5}
                  maxLength={1000}
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="e.g. Output image corrupted due to model artifact error reported in support ticket #4492."
                  className="mt-1 block h-20 w-full rounded-xl border border-input bg-background p-3 text-xs"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => setActiveDialog(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isPending || refundReason.trim().length < 5}
                >
                  {isPending ? "Refunding..." : "Confirm & Refund"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
