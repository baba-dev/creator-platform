import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand } from "@/components/ui/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { CancelJobButton } from "@/components/studio/cancel-job-button";
import { JobRefresh } from "@/components/studio/job-refresh";
import { getCustomerJob } from "@/lib/generation-history";
import { requireOrganizationPermission } from "@/lib/request-auth";

export default async function CustomerJobPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; jobId: string }>;
}) {
  const { organizationSlug, jobId } = await params;
  const { session, membership } = await requireOrganizationPermission(
    organizationSlug,
    "workspace:view",
  );
  const job = await getCustomerJob(
    jobId,
    membership.organizationId,
    session.user.id,
  );
  if (!job) notFound();
  const request =
    job.request &&
    typeof job.request === "object" &&
    !Array.isArray(job.request)
      ? (job.request as Record<string, unknown>)
      : {};
  const text =
    typeof request.prompt === "string"
      ? request.prompt
      : typeof request.text === "string"
        ? request.text
        : null;
  const settings = Object.entries(request).filter(
    ([key]) => !["prompt", "text", "speaker"].includes(key),
  );
  const times = [
    ["Created", job.createdAt],
    ["Quoted", job.quotedAt],
    ["Queued", job.queuedAt],
    ["Submitted", job.submittedAt],
    ["Completed", job.completedAt],
  ] as const;
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="flex min-h-[72px] items-center justify-between border-b border-border px-4 sm:px-8">
        <Brand />
        <ThemeToggle />
      </header>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-8">
        <Link
          href={`/app/${organizationSlug}/history`}
          className="text-sm font-semibold text-primary"
        >
          ← Generation history
        </Link>
        <section className="rounded-3xl border border-border bg-card p-6">
          <p className="text-sm text-primary">
            {job.kind} · {job.status.replaceAll("_", " ")}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold">{job.model}</h1>
          <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
            Support reference: {job.id}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {job.project?.name ?? "No project"} · Created by {job.creator.name}
          </p>
          <div className="mt-3">
            <JobRefresh
              active={["QUEUED", "SUBMITTED", "PROCESSING"].includes(
                job.status,
              )}
            />
          </div>
          {job.canCancel && (
            <div className="mt-5">
              <CancelJobButton jobId={job.id} />
            </div>
          )}
        </section>
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-xl font-semibold">Request</h2>
          {text ? (
            <p className="mt-3 whitespace-pre-wrap break-words text-sm">
              {text}
            </p>
          ) : (
            <p className="mt-3 text-muted-foreground">No prompt stored.</p>
          )}
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            {settings.map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs text-muted-foreground">{key}</dt>
                <dd className="break-words text-sm">
                  {typeof value === "string" ||
                  typeof value === "number" ||
                  typeof value === "boolean"
                    ? String(value)
                    : "—"}
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-display text-xl font-semibold">Timeline</h2>
            <dl className="mt-4 space-y-2">
              {times
                .filter(([, date]) => date)
                .map(([label, date]) => (
                  <div
                    key={label}
                    className="flex justify-between gap-4 text-sm"
                  >
                    <dt>{label}</dt>
                    <dd className="text-muted-foreground">
                      {date?.toLocaleString()}
                    </dd>
                  </div>
                ))}
            </dl>
            {job.events.length > 0 && (
              <div className="mt-5 border-t border-border pt-4">
                <h3 className="text-sm font-semibold">Activity and recovery</h3>
                <ol className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {job.events.map((event, index) => (
                    <li key={`${event.action}-${index}`}>
                      {event.action
                        .replace(/^generation\./, "")
                        .replaceAll("_", " ")}{" "}
                      · {event.at.toLocaleString()}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {job.errorMessage && (
              <p className="mt-4 rounded-xl bg-warning/10 p-3 text-sm">
                {job.errorMessage}
              </p>
            )}
            {job.status === "MANUAL_REVIEW" && (
              <p className="mt-3 text-sm text-muted-foreground">
                The provider outcome needs review. Credits remain reserved until
                resolved.
              </p>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-display text-xl font-semibold">Credits</h2>
            <p className="mt-3 text-sm">
              Reserved: {job.reservedCredits} · Charged: {job.chargedCredits}
            </p>
            {job.quotedUnits !== null && (
              <p className="mt-1 text-xs text-muted-foreground">
                Quoted units: {job.quotedUnits}
                {job.billableQuantity !== null
                  ? ` · Billable quantity: ${job.billableQuantity}`
                  : ""}
                {job.actualUnits !== null
                  ? ` · Actual units: ${job.actualUnits}`
                  : ""}
              </p>
            )}
            <ol className="mt-4 space-y-2">
              {job.entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex justify-between gap-3 text-sm"
                >
                  <span>
                    {entry.type.replaceAll("_", " ")} ·{" "}
                    {entry.createdAt.toLocaleString()}
                  </span>
                  <strong>{entry.amountCredits}</strong>
                </li>
              ))}
            </ol>
          </div>
        </section>
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-xl font-semibold">Assets</h2>
          {job.assets.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              No assets attached yet.
            </p>
          )}
          <div className="mt-3 space-y-3">
            {job.assets.map((asset) => (
              <div
                key={asset.id}
                className="rounded-xl border border-border p-3 text-sm"
              >
                <p>
                  {asset.mimeType} · {asset.status} · {asset.byteSize} bytes
                  {asset.width && asset.height
                    ? ` · ${asset.width} × ${asset.height}`
                    : ""}
                </p>
                {asset.status === "READY" && (
                  <a
                    className="mt-2 inline-flex text-primary underline"
                    href={`/api/assets/${asset.id}?download=1`}
                  >
                    Download asset
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
