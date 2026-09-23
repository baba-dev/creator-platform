import { hasPlatformPermission } from "@aiwa/authz";
import { getJobReconciliationDetails } from "@aiwa/generation";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/admin/primitives";
import { Eyebrow } from "@/components/ui/creative";
import { JobResolutionActions } from "@/components/admin/job-resolution-actions";
import { serializeJobDetails } from "@/lib/job-serialization";
import { requirePlatformPermission } from "@/lib/request-auth";

function statusTone(status: string) {
  switch (status) {
    case "SUCCEEDED":
      return "success";
    case "FAILED":
    case "CANCELLED":
      return "danger";
    case "MANUAL_REVIEW":
      return "warning";
    case "PROCESSING":
    case "SUBMITTED":
    case "QUEUED":
      return "info";
    default:
      return "neutral";
  }
}

function formatBytes(bytes: bigint | number | string) {
  const b = typeof bytes === "bigint" ? Number(bytes) : Number(bytes || 0);
  if (b === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KiB", "MiB", "GiB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${parseFloat((b / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const session = await requirePlatformPermission("jobs:read");
  const { jobId } = await params;

  const rawDetails = await getJobReconciliationDetails(jobId);
  if (!rawDetails) {
    notFound();
  }

  const details = serializeJobDetails(rawDetails);
  if (!details) {
    notFound();
  }
  const { job, ledgerEntries, auditEvents, permittedActions } = details;

  const canManage = hasPlatformPermission(
    session.user.platformRole,
    "jobs:manage",
  );

  const pendingAsset = job.assets.find((a) => a.status === "PENDING");
  const outputPayload = job.outputPayload as {
    url?: string;
    stored?: boolean;
  } | null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Back Link */}
      <div className="mb-6">
        <Link
          href="/admin/jobs"
          className="inline-flex items-center text-xs font-semibold text-primary hover:underline"
        >
          ← Back to generation jobs
        </Link>
      </div>

      {/* Header Banner */}
      <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Eyebrow>Generation Job</Eyebrow>
            <StatusBadge tone={statusTone(job.status)}>
              {job.status}
            </StatusBadge>
          </div>
          <h1 className="mt-2 font-mono text-2xl font-bold tracking-tight text-foreground">
            {job.id}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Created on{" "}
            {new Date(job.createdAt).toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            {job.completedAt
              ? ` • Completed on ${new Date(job.completedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`
              : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <span className="text-xs font-medium text-muted-foreground">
            Reserved Credits
          </span>
          <span className="font-mono text-2xl font-bold text-foreground">
            {job.reservedCredits}
          </span>
          <span className="text-[11px] text-muted-foreground">
            Charged: {job.chargedCredits} credits
          </span>
        </div>
      </div>

      {/* Manual Review Alert Notice */}
      {job.status === "MANUAL_REVIEW" ? (
        <div className="mt-6 rounded-2xl border border-warning/40 bg-warning/10 p-5 text-sm text-foreground">
          <div className="flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <h2 className="font-display font-bold text-warning">
                Job Requires Administrative Resolution
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                This job entered{" "}
                <code className="font-mono font-bold text-warning">
                  MANUAL_REVIEW
                </code>{" "}
                because an uncertain outcome occurred (e.g. network timeout or
                storage recovery failure). The platform deliberately withheld
                automatic resubmission to prevent duplicate provider charges.
                Review the evidence, reconcile the provider outcome, and execute
                the appropriate resolution action below.
              </p>
              {pendingAsset ? (
                <p className="mt-2 text-xs font-medium text-warning">
                  Pending storage allocation:{" "}
                  <span className="font-mono font-bold">
                    {formatBytes(pendingAsset.byteSize)}
                  </span>{" "}
                  is held against the organization quota. Releasing the
                  reservation will immediately delete this allocation.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Details Grid */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Workspace & Creator */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
          <h2 className="font-display text-sm font-bold text-foreground">
            Organization & User
          </h2>
          <div className="mt-3 space-y-2 text-xs">
            <div>
              <span className="text-muted-foreground">Workspace:</span>{" "}
              <Link
                href={`/admin/organizations/${job.organization.id}`}
                className="font-semibold text-primary hover:underline"
              >
                {job.organization.name}
              </Link>
            </div>
            <div>
              <span className="text-muted-foreground">Workspace Status:</span>{" "}
              <span className="font-mono">{job.organization.status}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Wallet Balance:</span>{" "}
              <span className="font-mono font-bold">
                {job.organization.wallet?.balanceCache ?? "0"} credits
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Created By:</span>{" "}
              <span className="font-semibold">{job.createdBy.name}</span>{" "}
              <span className="text-muted-foreground">
                ({job.createdBy.email})
              </span>
            </div>
            {job.project ? (
              <div>
                <span className="text-muted-foreground">Project:</span>{" "}
                <span>{job.project.name}</span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Model & Accounting */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
          <h2 className="font-display text-sm font-bold text-foreground">
            Model & Accounting
          </h2>
          <div className="mt-3 space-y-2 text-xs">
            <div>
              <span className="text-muted-foreground">Model:</span>{" "}
              <span className="font-semibold">
                {job.providerModel.displayName}
              </span>{" "}
              <span className="font-mono text-muted-foreground">
                ({job.providerModel.providerModelId})
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Provider:</span>{" "}
              <span className="font-mono">{job.providerModel.provider}</span> (
              {job.providerModel.mediaKind})
            </div>
            <div>
              <span className="text-muted-foreground">Quoted Units:</span>{" "}
              <span className="font-mono">{job.quotedUnits ?? "1"}</span>
              {job.billableQuantity ? ` (${job.billableQuantity} chars)` : ""}
            </div>
            <div>
              <span className="text-muted-foreground">Customer Price:</span>{" "}
              <span className="font-mono">
                {job.priceVersion?.customerCredits ?? "0"} credits/unit
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Provider Cost:</span>{" "}
              <span className="font-mono">
                {job.actualProviderCostMicroUsd
                  ? `${job.actualProviderCostMicroUsd} micro-USD`
                  : job.priceVersion?.providerCostMicroUsd
                    ? `~${job.priceVersion.providerCostMicroUsd} micro-USD`
                    : "Unknown"}
              </span>
            </div>
          </div>
        </div>

        {/* Provider Request & Diagnostics */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
          <h2 className="font-display text-sm font-bold text-foreground">
            Diagnostics & Provider Info
          </h2>
          <div className="mt-3 space-y-2 text-xs">
            <div>
              <span className="text-muted-foreground">
                Provider Request ID:
              </span>{" "}
              <span className="font-mono font-semibold">
                {job.providerRequestId || "None recorded"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Idempotency Key:</span>{" "}
              <span className="font-mono text-[11px] break-all">
                {job.idempotencyKey}
              </span>
            </div>
            {job.errorCode ? (
              <div>
                <span className="text-muted-foreground">Diagnostic Code:</span>{" "}
                <span className="font-mono font-bold text-destructive">
                  {job.errorCode}
                </span>
              </div>
            ) : null}
            {job.errorMessage ? (
              <div>
                <span className="text-muted-foreground">
                  Diagnostic Message:
                </span>
                <p className="mt-1 rounded-lg bg-surface-sunken p-2 font-mono text-[11px] leading-4 text-destructive">
                  {job.errorMessage}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Assets & Storage Allocation Table */}
      <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-xs">
        <h2 className="font-display text-sm font-bold text-foreground">
          Storage Assets & Quota Allocations
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="p-2 font-semibold">Object Key</th>
                <th className="p-2 font-semibold">Status</th>
                <th className="p-2 font-semibold">MIME Type</th>
                <th className="p-2 font-semibold text-right">Size</th>
                <th className="p-2 font-semibold">SHA-256</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {job.assets.map((asset) => (
                <tr key={asset.id}>
                  <td className="p-2 font-mono font-medium">
                    {asset.objectKey}
                  </td>
                  <td className="p-2">
                    <StatusBadge
                      tone={
                        asset.status === "READY"
                          ? "success"
                          : asset.status === "PENDING"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {asset.status}
                    </StatusBadge>
                  </td>
                  <td className="p-2 font-mono text-muted-foreground">
                    {asset.mimeType}
                  </td>
                  <td className="p-2 text-right font-mono tabular-nums">
                    {formatBytes(asset.byteSize)}
                  </td>
                  <td className="p-2 font-mono text-[11px] text-muted-foreground">
                    {asset.sha256 ? `${asset.sha256.slice(0, 16)}...` : "—"}
                  </td>
                </tr>
              ))}
              {job.assets.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="p-4 text-center text-muted-foreground"
                  >
                    No assets recorded for this job.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Request & Output Payloads */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
          <h2 className="font-display text-sm font-bold text-foreground">
            Request Payload
          </h2>
          <pre className="mt-3 max-h-60 overflow-y-auto rounded-xl bg-surface-sunken p-3 font-mono text-xs leading-5">
            {JSON.stringify(job.requestPayload, null, 2)}
          </pre>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
          <h2 className="font-display text-sm font-bold text-foreground">
            Output Payload & Metadata
          </h2>
          <pre className="mt-3 max-h-60 overflow-y-auto rounded-xl bg-surface-sunken p-3 font-mono text-xs leading-5">
            {job.outputPayload
              ? JSON.stringify(job.outputPayload, null, 2)
              : "No output metadata recorded."}
          </pre>
        </div>
      </div>

      {/* Administrative Resolution Hub */}
      <JobResolutionActions
        jobId={job.id}
        status={job.status}
        reservedCredits={job.reservedCredits}
        chargedCredits={job.chargedCredits}
        providerRequestId={job.providerRequestId}
        outputUrl={outputPayload?.url ?? null}
        mediaKind={job.providerModel.mediaKind}
        canManage={canManage}
        permittedActions={permittedActions}
      />

      {/* Ledger History */}
      <div className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-xs">
        <h2 className="font-display text-sm font-bold text-foreground">
          Credit Ledger Transactions
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="p-2 font-semibold">Entry ID</th>
                <th className="p-2 font-semibold">Type</th>
                <th className="p-2 font-semibold text-right">Amount</th>
                <th className="p-2 font-semibold text-right">Balance After</th>
                <th className="p-2 font-semibold">Description</th>
                <th className="p-2 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ledgerEntries.map((entry) => (
                <tr key={entry.id}>
                  <td className="p-2 font-mono">{entry.id}</td>
                  <td className="p-2">
                    <StatusBadge
                      tone={
                        entry.type === "CAPTURE"
                          ? "success"
                          : entry.type === "RESERVATION"
                            ? "info"
                            : entry.type === "REFUND" ||
                                entry.type === "RELEASE"
                              ? "warning"
                              : "neutral"
                      }
                    >
                      {entry.type}
                    </StatusBadge>
                  </td>
                  <td className="p-2 text-right font-mono font-bold tabular-nums">
                    {entry.amountCredits}
                  </td>
                  <td className="p-2 text-right font-mono tabular-nums text-muted-foreground">
                    {entry.balanceAfter}
                  </td>
                  <td className="p-2 text-muted-foreground">
                    {entry.description ?? "—"}
                  </td>
                  <td className="p-2 text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString("en-US", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                </tr>
              ))}
              {ledgerEntries.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="p-4 text-center text-muted-foreground"
                  >
                    No ledger entries for this job.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit Trail */}
      <div className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-xs">
        <h2 className="font-display text-sm font-bold text-foreground">
          Audit History
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="p-2 font-semibold">Action</th>
                <th className="p-2 font-semibold">Actor</th>
                <th className="p-2 font-semibold">Details</th>
                <th className="p-2 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {auditEvents.map((evt) => (
                <tr key={evt.id}>
                  <td className="p-2 font-mono font-semibold text-primary">
                    {evt.action}
                  </td>
                  <td className="p-2 text-muted-foreground">
                    {evt.actor
                      ? `${evt.actor.name} (${evt.actor.email})`
                      : "System"}
                  </td>
                  <td className="p-2 text-muted-foreground">
                    {evt.metadata ? (
                      <span className="font-mono text-[11px]">
                        {JSON.stringify(evt.metadata)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-2 text-muted-foreground">
                    {new Date(evt.createdAt).toLocaleString("en-US", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                </tr>
              ))}
              {auditEvents.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="p-4 text-center text-muted-foreground"
                  >
                    No audit events recorded for this job.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
