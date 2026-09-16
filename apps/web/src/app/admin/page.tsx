import { getPlatformPermissions, hasPlatformPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import Link from "next/link";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Brand } from "@/components/ui/brand";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { requirePlatformPermission } from "@/lib/request-auth";

const adminNavigation: readonly { label: string; icon: IconName }[] = [
  { label: "Overview", icon: "dashboard" },
  { label: "Organizations", icon: "projects" },
  { label: "Customers", icon: "admin" },
  { label: "Payments", icon: "credits" },
  { label: "Model catalog", icon: "sparkles" },
  { label: "Generation jobs", icon: "activity" },
];

export default async function AdminPage() {
  const session = await requirePlatformPermission("platform:access");
  const permissions = getPlatformPermissions(session.user.platformRole);
  const canReadUsers = hasPlatformPermission(
    session.user.platformRole,
    "users:read",
  );
  const canReadOrganizations = hasPlatformPermission(
    session.user.platformRole,
    "organizations:read",
  );
  const canReadPayments = hasPlatformPermission(
    session.user.platformRole,
    "payments:read",
  );
  const canReadJobs = hasPlatformPermission(
    session.user.platformRole,
    "jobs:read",
  );
  const canReadModels = hasPlatformPermission(
    session.user.platformRole,
    "models:read",
  );
  const canGrantCredits = hasPlatformPermission(
    session.user.platformRole,
    "credits:grant",
  );

  const [
    userCount,
    organizationCount,
    pendingPaymentCount,
    jobCount,
    modelCount,
    organizations,
  ] = await Promise.all([
    canReadUsers
      ? db.user.count({ where: { disabledAt: null } })
      : Promise.resolve(null),
    canReadOrganizations
      ? db.organization.count({ where: { status: "ACTIVE" } })
      : Promise.resolve(null),
    canReadPayments
      ? db.manualPayment.count({ where: { status: "PENDING" } })
      : Promise.resolve(null),
    canReadJobs ? db.generationJob.count() : Promise.resolve(null),
    canReadModels
      ? db.providerModel.count({ where: { enabled: true } })
      : Promise.resolve(null),
    canReadOrganizations
      ? db.organization.findMany({
          where: { status: "ACTIVE" },
          select: {
            id: true,
            name: true,
            createdAt: true,
            wallet: { select: { balanceCache: true } },
            _count: { select: { memberships: true, generationJobs: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        })
      : Promise.resolve([]),
  ]);

  const roleLabel = session.user.platformRole.replaceAll("_", " ");

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="creative-glow pointer-events-none fixed inset-0" />
      <div className="relative mx-auto grid min-h-screen max-w-[1800px] xl:grid-cols-[250px_1fr]">
        <aside className="hidden border-r border-border bg-sidebar/80 px-4 py-5 backdrop-blur-xl xl:flex xl:flex-col">
          <div className="px-2">
            <Brand />
          </div>
          <div className="mx-2 mt-7 rounded-xl border border-warning/10 bg-warning/[0.05] px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-lg bg-warning/10 text-warning">
                <Icon name="admin" className="size-3.5" />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-warning">
                  Operations console
                </p>
                <p className="mt-0.5 text-[9px] text-subtle-foreground">
                  Restricted platform access
                </p>
              </div>
            </div>
          </div>
          <nav
            className="mt-6 space-y-1"
            aria-label="Administration navigation"
          >
            {adminNavigation.map((item, index) => (
              <span
                key={item.label}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${index === 0 ? "bg-foreground/[0.075] text-foreground" : "text-subtle-foreground"}`}
              >
                <Icon
                  name={item.icon}
                  className={`size-[18px] ${index === 0 ? "text-warning" : "text-subtle-foreground"}`}
                />
                {item.label}
                {item.label === "Payments" && pendingPaymentCount ? (
                  <span className="ml-auto rounded-full bg-warning/10 px-2 py-0.5 text-[9px] font-bold text-warning">
                    {pendingPaymentCount}
                  </span>
                ) : null}
              </span>
            ))}
          </nav>
          <div className="mt-auto rounded-2xl border border-border bg-foreground/[0.025] p-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-subtle-foreground">
              Signed in with
            </p>
            <p className="mt-2 text-xs font-semibold text-foreground/90">
              {roleLabel}
            </p>
            <p className="mt-1 truncate text-[10px] text-subtle-foreground">
              {session.user.email}
            </p>
            <div className="mt-3 border-t border-border pt-2">
              <SignOutButton />
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 flex min-h-[72px] items-center justify-between gap-4 border-b border-border bg-background/80 px-4 backdrop-blur-xl sm:px-7 lg:px-9">
            <div className="flex items-center gap-3">
              <div className="xl:hidden">
                <Brand compact />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Platform administration
                </p>
                <p className="mt-0.5 hidden text-[10px] uppercase tracking-[0.12em] text-subtle-foreground sm:block">
                  Aiwa Creators · Operations
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <span className="hidden rounded-full border border-primary/15 bg-primary/[0.06] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-primary sm:inline-flex">
                UI preview
              </span>
              <Button asChild variant="secondary" size="sm">
                <Link href="/app">Customer workspace</Link>
              </Button>
            </div>
          </header>

          <div className="px-4 py-7 sm:px-7 lg:px-9 lg:py-9">
            <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold text-warning">
                  Good morning, operations team
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-foreground sm:text-4xl">
                  Everything under control.
                </h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Customers, credits, payments, models, and generation health in
                  one place.
                </p>
              </div>
              <Button
                disabled={!canGrantCredits}
                title={
                  canGrantCredits
                    ? "Credit workflow is the next milestone"
                    : "Finance permission required"
                }
              >
                <Icon name="plus" className="size-4" /> Assign credits
              </Button>
            </section>

            <section
              className="mt-7 grid gap-3 sm:grid-cols-2 2xl:grid-cols-5"
              aria-label="Platform overview"
            >
              <AdminMetric
                label="Active organizations"
                value={displayCount(organizationCount)}
                icon="projects"
                tone="violet"
              />
              <AdminMetric
                label="Active customers"
                value={displayCount(userCount)}
                icon="admin"
                tone="cyan"
              />
              <AdminMetric
                label="Total jobs"
                value={displayCount(jobCount)}
                icon="activity"
                tone="emerald"
              />
              <AdminMetric
                label="Enabled models"
                value={displayCount(modelCount)}
                icon="sparkles"
                tone="blue"
              />
              <AdminMetric
                label="Pending payments"
                value={displayCount(pendingPaymentCount)}
                icon="credits"
                tone="amber"
              />
            </section>

            <section className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]">
              <div className="rounded-[26px] border border-border bg-card/85 p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Organizations
                    </p>
                    <p className="mt-1 text-xs text-subtle-foreground">
                      Current customer workspaces and balances
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-semibold text-primary"
                  >
                    View all
                  </button>
                </div>
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-border text-[9px] font-bold uppercase tracking-[0.14em] text-subtle-foreground">
                        <th className="pb-3 font-semibold">Organization</th>
                        <th className="pb-3 font-semibold">Members</th>
                        <th className="pb-3 font-semibold">Jobs</th>
                        <th className="pb-3 font-semibold">Balance</th>
                        <th className="pb-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {organizations.length > 0 ? (
                        organizations.map((organization) => (
                          <tr key={organization.id} className="text-xs">
                            <td className="py-4">
                              <div className="flex items-center gap-3">
                                <span className="grid size-9 place-items-center rounded-xl bg-primary/10 font-bold text-primary">
                                  {organization.name[0]?.toUpperCase() ?? "O"}
                                </span>
                                <div>
                                  <p className="max-w-56 truncate font-semibold text-foreground">
                                    {organization.name}
                                  </p>
                                  <p className="mt-0.5 text-[9px] text-subtle-foreground">
                                    Added{" "}
                                    {organization.createdAt.toLocaleDateString(
                                      "en-GB",
                                      {
                                        day: "2-digit",
                                        month: "short",
                                        year: "numeric",
                                      },
                                    )}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 text-muted-foreground">
                              {organization._count.memberships}
                            </td>
                            <td className="py-4 text-muted-foreground">
                              {organization._count.generationJobs}
                            </td>
                            <td className="py-4 font-semibold text-foreground/90">
                              {(
                                organization.wallet?.balanceCache ?? 0n
                              ).toLocaleString("en-US")}
                            </td>
                            <td className="py-4">
                              <span className="rounded-full bg-success/10 px-2.5 py-1 text-[9px] font-bold text-success">
                                Active
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-12 text-center">
                            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-foreground/[0.04] text-subtle-foreground">
                              <Icon name="projects" />
                            </span>
                            <p className="mt-3 text-sm font-semibold text-muted-foreground">
                              No organization data to display
                            </p>
                            <p className="mt-1 text-xs text-subtle-foreground">
                              Organizations will appear here after signup.
                            </p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-[26px] border border-border bg-card/85 p-5 sm:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Platform health
                      </p>
                      <p className="mt-1 text-xs text-subtle-foreground">
                        Operational readiness
                      </p>
                    </div>
                    <span className="size-2 rounded-full bg-success shadow-[0_0_12px_color-mix(in_oklch,var(--success)_65%,transparent)]" />
                  </div>
                  <div className="mt-5 space-y-3">
                    <HealthRow
                      label="Web application"
                      detail="Online"
                      value="99.9%"
                      good
                    />
                    <HealthRow
                      label="Worker queue"
                      detail="Ready for provider adapter"
                      value="Staged"
                    />
                    <HealthRow
                      label="BytePlus gateway"
                      detail="Credentials required"
                      value="Pending"
                    />
                    <HealthRow
                      label="NVIDIA assistant"
                      detail="Credentials required"
                      value="Pending"
                    />
                  </div>
                </div>

                <div className="rounded-[26px] border border-warning/10 bg-warning/[0.06] p-5 sm:p-6">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning/10 text-warning">
                      <Icon name="credits" className="size-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Finance workflow next
                      </p>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        Record cash and cheque payments in OMR, then issue
                        credits through an immutable ledger entry.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                    <span className="text-[10px] font-semibold text-subtle-foreground">
                      Permission required
                    </span>
                    <span className="rounded-md bg-foreground/[0.05] px-2 py-1 text-[9px] font-bold text-muted-foreground">
                      credits:grant
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-6 rounded-[26px] border border-border bg-card/85 p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Your access boundary
                  </p>
                  <p className="mt-1 text-xs text-subtle-foreground">
                    Server-enforced permissions for {roleLabel}
                  </p>
                </div>
                <span className="rounded-full border border-success/15 bg-success/[0.06] px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-success">
                  RBAC active
                </span>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {permissions.map((permission) => (
                  <span
                    key={permission}
                    className="rounded-lg border border-border bg-foreground/[0.025] px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground"
                  >
                    {permission}
                  </span>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function displayCount(value: number | null): string {
  return value === null ? "Restricted" : value.toLocaleString("en-US");
}

function AdminMetric({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: IconName;
  tone: "violet" | "cyan" | "emerald" | "blue" | "amber";
}) {
  const tones = {
    violet: "bg-primary/10 text-primary",
    cyan: "bg-info/10 text-info",
    emerald: "bg-success/10 text-success",
    blue: "bg-info/10 text-info",
    amber: "bg-warning/10 text-warning",
  };
  return (
    <article className="rounded-2xl border border-border bg-foreground/[0.025] p-4">
      <div className="flex items-start justify-between">
        <span
          className={`grid size-9 place-items-center rounded-xl ${tones[tone]}`}
        >
          <Icon name={icon} className="size-4" />
        </span>
        <span className="text-[9px] text-subtle-foreground">Live</span>
      </div>
      <p
        className={`mt-4 font-semibold tracking-tight text-foreground ${value === "Restricted" ? "text-sm" : "text-2xl"}`}
      >
        {value}
      </p>
      <p className="mt-1 text-[10px] text-subtle-foreground">{label}</p>
    </article>
  );
}

function HealthRow({
  label,
  detail,
  value,
  good = false,
}: {
  label: string;
  detail: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-foreground/[0.02] p-3">
      <span
        className={`size-2 rounded-full ${good ? "bg-success" : "bg-warning"}`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground/90">{label}</p>
        <p className="mt-0.5 truncate text-[9px] text-subtle-foreground">
          {detail}
        </p>
      </div>
      <span className="text-[9px] font-semibold text-muted-foreground">
        {value}
      </span>
    </div>
  );
}
