import { getPlatformPermissions, hasPlatformPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import Link from "next/link";
import type { Route } from "next";

import {
  DataTable,
  EmptyState,
  Pagination,
  StatusBadge,
} from "@/components/admin/primitives";
import { AssignCreditsDialog } from "@/components/admin/payment-actions";
import { Eyebrow } from "@/components/ui/creative";
import { Icon, type IconName } from "@/components/ui/icon";
import { requirePlatformPermission } from "@/lib/request-auth";

const PAGE_SIZE = 5;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await requirePlatformPermission("platform:access");
  const params = await searchParams;
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;
  const role = session.user.platformRole;
  const can = (permission: Parameters<typeof hasPlatformPermission>[1]) =>
    hasPlatformPermission(role, permission);
  const now = new Date();

  const [
    activeUsers,
    organizationStates,
    walletCredits,
    pendingCheques,
    jobStates,
    unpricedModels,
    organizations,
    organizationTotal,
    recentEvents,
    allOrganizations,
  ] = await Promise.all([
    can("users:read") ? db.user.count({ where: { disabledAt: null } }) : null,
    can("organizations:read")
      ? db.organization.groupBy({ by: ["status"], _count: true })
      : [],
    can("payments:read")
      ? db.wallet.aggregate({ _sum: { balanceCache: true } })
      : null,
    can("payments:read")
      ? db.manualPayment.count({
          where: { method: "CHEQUE", status: "PENDING" },
        })
      : null,
    can("jobs:read")
      ? db.generationJob.groupBy({ by: ["status"], _count: true })
      : [],
    can("models:read")
      ? db.providerModel.count({
          where: {
            enabled: true,
            priceVersions: {
              none: {
                effectiveFrom: { lte: now },
                OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
              },
            },
          },
        })
      : null,
    can("organizations:read")
      ? db.organization.findMany({
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            createdAt: true,
            wallet: can("payments:read")
              ? { select: { balanceCache: true } }
              : false,
            _count: { select: { memberships: true, generationJobs: true } },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
        })
      : [],
    can("organizations:read") ? db.organization.count() : 0,
    can("audit:read")
      ? db.auditEvent.findMany({
          select: {
            id: true,
            action: true,
            targetType: true,
            createdAt: true,
            actor: { select: { name: true } },
            organization: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 6,
        })
      : [],
    can("organizations:read")
      ? db.organization.findMany({
          where: { status: "ACTIVE" },
          select: { id: true, name: true, slug: true },
          orderBy: { name: "asc" },
        })
      : [],
  ]);

  const orgCount = (status: "ACTIVE" | "SUSPENDED") =>
    organizationStates.find((item) => item.status === status)?._count ?? 0;
  const jobCount = (
    statuses: readonly (typeof jobStates)[number]["status"][],
  ) =>
    jobStates
      .filter((item) => statuses.includes(item.status))
      .reduce((total, item) => total + item._count, 0);
  const queuedJobs = jobCount(["QUEUED"]);
  const processingJobs = jobCount(["SUBMITTED", "PROCESSING"]);
  const failedJobs = jobCount(["FAILED"]);
  const reviewJobs = jobCount(["MANUAL_REVIEW"]);
  const hasNext = page * PAGE_SIZE < organizationTotal;
  const permissions = getPlatformPermissions(role);

  return (
    <div className="px-4 py-7 sm:px-7 lg:px-9 lg:py-9">
      <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Eyebrow>Operations overview</Eyebrow>
          <h1 className="font-display mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
            Platform at a glance.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Point-in-time customer, finance, generation, and infrastructure
            signals.
          </p>
        </div>
        <AssignCreditsDialog
          canGrant={can("credits:grant")}
          organizations={allOrganizations}
        />
      </section>

      <section
        className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6"
        aria-label="Platform overview"
      >
        <Metric
          label="Active organizations"
          value={formatCount(can("organizations:read"), orgCount("ACTIVE"))}
          icon="projects"
        />
        <Metric
          label="Suspended organizations"
          value={formatCount(can("organizations:read"), orgCount("SUSPENDED"))}
          icon="admin"
          warning={orgCount("SUSPENDED") > 0}
        />
        <Metric
          label="Active users"
          value={formatNullable(activeUsers)}
          icon="admin"
        />
        <Metric
          label="Wallet credits"
          value={
            walletCredits
              ? formatBigInt(walletCredits._sum.balanceCache ?? 0n)
              : "Restricted"
          }
          icon="credits"
          numeric
        />
        <Metric
          label="Pending cheques"
          value={formatNullable(pendingCheques)}
          icon="credits"
          warning={(pendingCheques ?? 0) > 0}
        />
        <Metric
          label="Models without price"
          value={formatNullable(unpricedModels)}
          icon="sparkles"
          warning={(unpricedModels ?? 0) > 0}
        />
      </section>

      {pendingCheques || failedJobs || reviewJobs || unpricedModels ? (
        <section
          className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4"
          aria-label="Action required"
        >
          {pendingCheques ? (
            <WarningCard
              href="/admin/payments?status=PENDING&method=CHEQUE"
              label="Pending cheque payments"
              value={pendingCheques}
            />
          ) : null}
          {failedJobs ? (
            <WarningCard
              href="/admin/jobs?status=FAILED"
              label="Failed generation jobs"
              value={failedJobs}
            />
          ) : null}
          {reviewJobs ? (
            <WarningCard
              href="/admin/jobs?status=MANUAL_REVIEW"
              label="Jobs awaiting manual review"
              value={reviewJobs}
            />
          ) : null}
          {unpricedModels ? (
            <WarningCard
              href="/admin/models?pricing=missing"
              label="Enabled models without a price"
              value={unpricedModels}
            />
          ) : null}
        </section>
      ) : null}

      <section className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl font-semibold">
                Organizations
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Latest workspaces, balances, and account state
              </p>
            </div>
            {can("organizations:read") ? (
              <Link
                href={"/admin/organizations" as Route}
                className="text-xs font-semibold text-primary"
              >
                View all
              </Link>
            ) : null}
          </div>
          {organizations.length ? (
            <>
              <DataTable label="Organizations">
                <thead>
                  <tr className="border-b border-border text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    <th className="pb-3">Organization</th>
                    <th className="pb-3">Members</th>
                    <th className="pb-3">Jobs</th>
                    <th className="pb-3 text-right">Credits</th>
                    <th className="pb-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {organizations.map((organization) => (
                    <tr key={organization.id} className="text-xs">
                      <td className="py-4">
                        <Link
                          href={
                            `/admin/organizations/${organization.id}` as Route
                          }
                          className="font-semibold text-primary hover:underline"
                        >
                          {organization.name}
                        </Link>
                        <p className="mt-1 font-mono text-[9px] text-muted-foreground">
                          {organization.slug}
                        </p>
                      </td>
                      <td className="py-4 text-muted-foreground">
                        {organization._count.memberships}
                      </td>
                      <td className="py-4 text-muted-foreground">
                        {organization._count.generationJobs}
                      </td>
                      <td className="py-4 text-right font-mono font-semibold tabular-nums">
                        {can("payments:read") ? (
                          <Link
                            href={
                              `/admin/organizations/${organization.id}/wallet` as Route
                            }
                            className="text-primary hover:underline"
                          >
                            {formatBigInt(
                              organization.wallet?.balanceCache ?? 0n,
                            )}
                          </Link>
                        ) : (
                          "Restricted"
                        )}
                      </td>
                      <td className="py-4 text-right">
                        <StatusBadge
                          tone={
                            organization.status === "ACTIVE"
                              ? "success"
                              : organization.status === "SUSPENDED"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {titleCase(organization.status)}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
              <Pagination page={page} hasNext={hasNext} basePath="/admin" />
            </>
          ) : (
            <EmptyState
              icon="projects"
              title={
                can("organizations:read")
                  ? "No organizations yet"
                  : "Organization data is restricted"
              }
              description={
                can("organizations:read")
                  ? "New customer workspaces will appear here after onboarding."
                  : "Your role does not include organizations:read."
              }
            />
          )}
        </div>
        <div className="space-y-6">
          <Panel title="Generation queue" subtitle="Current database state">
            <QueueRow
              label="Queued"
              value={can("jobs:read") ? queuedJobs : null}
              tone="neutral"
            />
            <QueueRow
              label="Processing"
              value={can("jobs:read") ? processingJobs : null}
              tone="info"
            />
            <QueueRow
              label="Failed"
              value={can("jobs:read") ? failedJobs : null}
              tone="danger"
            />
            <QueueRow
              label="Manual review"
              value={can("jobs:read") ? reviewJobs : null}
              tone="warning"
            />
          </Panel>
          <Panel
            title="Platform health"
            subtitle="Configuration and request-time signals"
          >
            <HealthRow
              label="Web and database"
              status="Healthy"
              tone="success"
            />
            <HealthRow
              label="Redis / worker"
              status={process.env.REDIS_URL ? "Degraded" : "Not configured"}
              detail={
                process.env.REDIS_URL
                  ? "Configured; no live heartbeat"
                  : undefined
              }
              tone="warning"
            />
            <HealthRow
              label="BytePlus"
              status={
                process.env.BYTEPLUS_API_KEY ? "Degraded" : "Not configured"
              }
              detail={
                process.env.BYTEPLUS_API_KEY
                  ? "Configured; no live provider probe"
                  : undefined
              }
              tone="warning"
            />
            <HealthRow
              label="NVIDIA"
              status={
                process.env.NVIDIA_API_KEY ? "Degraded" : "Not configured"
              }
              detail={
                process.env.NVIDIA_API_KEY
                  ? "Configured; no live provider probe"
                  : undefined
              }
              tone="warning"
            />
          </Panel>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
        <Panel
          title="Recent administrative events"
          subtitle="Immutable audit activity, newest first"
        >
          {recentEvents.length ? (
            <ol className="divide-y divide-border">
              {recentEvents.map((event) => (
                <li key={event.id} className="flex gap-3 py-3">
                  <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">
                      {event.action} · {event.targetType}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {event.actor?.name ?? "System"}
                      {event.organization
                        ? ` · ${event.organization.name}`
                        : ""}
                    </p>
                  </div>
                  <time
                    className="font-mono text-[9px] text-muted-foreground"
                    dateTime={event.createdAt.toISOString()}
                  >
                    {event.createdAt.toLocaleString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "UTC",
                    })}{" "}
                    UTC
                  </time>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState
              icon="assets"
              title={
                can("audit:read")
                  ? "No administrative events"
                  : "Audit activity is restricted"
              }
              description={
                can("audit:read")
                  ? "Audited operations will appear here."
                  : "Your role does not include audit:read."
              }
            />
          )}
        </Panel>
        <Panel title="Access boundary" subtitle={role.replaceAll("_", " ")}>
          <div className="flex flex-wrap gap-2">
            {permissions.map((permission) => (
              <span
                key={permission}
                className="rounded-lg border border-border bg-muted px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground"
              >
                {permission}
              </span>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  );
}

function formatCount(allowed: boolean, value: number) {
  return allowed ? value.toLocaleString("en-US") : "Restricted";
}
function formatNullable(value: number | null) {
  return value === null ? "Restricted" : value.toLocaleString("en-US");
}
function formatBigInt(value: bigint) {
  return value.toLocaleString("en-US");
}
function titleCase(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase().replaceAll("_", " ");
}

function Metric({
  label,
  value,
  icon,
  warning = false,
  numeric = false,
}: {
  label: string;
  value: string;
  icon: IconName;
  warning?: boolean;
  numeric?: boolean;
}) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-xs">
      <div className="flex items-start justify-between">
        <span
          className={`grid size-9 place-items-center rounded-xl ${warning ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"}`}
        >
          <Icon name={icon} className="size-4" />
        </span>
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          Now
        </span>
      </div>
      <p
        className={`mt-4 font-semibold tracking-tight ${value === "Restricted" ? "text-sm" : "text-2xl"} ${numeric ? "font-mono tabular-nums" : ""}`}
      >
        {value}
      </p>
      <p className="mt-1 text-[10px] text-muted-foreground">{label}</p>
    </article>
  );
}
function WarningCard({
  href,
  label,
  value,
}: {
  href: string;
  label: string;
  value: number;
}) {
  return (
    <Link
      href={href as Route}
      className="flex min-h-20 items-center gap-3 rounded-2xl border border-warning/25 bg-warning/[0.07] p-4 transition-colors hover:bg-warning/10"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-warning/15 font-mono font-bold text-warning">
        {value}
      </span>
      <span className="text-xs font-semibold">{label}</span>
      <Icon name="chevron" className="ml-auto size-4 text-warning" />
    </Link>
  );
}
function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="mt-1 mb-4 text-xs text-muted-foreground">{subtitle}</p>
      {children}
    </div>
  );
}
function QueueRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: "neutral" | "info" | "warning" | "danger";
}) {
  return (
    <div className="flex items-center justify-between border-t border-border py-3 first:border-t-0">
      <span className="text-xs font-medium">{label}</span>
      <StatusBadge tone={tone}>
        {value === null ? "Restricted" : value.toLocaleString("en-US")}
      </StatusBadge>
    </div>
  );
}
function HealthRow({
  label,
  status,
  detail,
  tone,
}: {
  label: string;
  status: string;
  detail?: string;
  tone: "success" | "warning";
}) {
  return (
    <div className="flex items-center gap-3 border-t border-border py-3 first:border-t-0">
      <span
        className={`size-2 rounded-full ${tone === "success" ? "bg-success" : "bg-warning"}`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold">{label}</p>
        {detail ? (
          <p className="mt-0.5 text-[9px] text-muted-foreground">{detail}</p>
        ) : null}
      </div>
      <StatusBadge tone={tone}>{status}</StatusBadge>
    </div>
  );
}
