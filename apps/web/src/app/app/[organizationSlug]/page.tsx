import { hasOrganizationPermission, hasPlatformPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import Link from "next/link";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { OrganizationSwitcher } from "@/components/organizations/organization-switcher";
import { GenerationStudio } from "@/components/studio/generation-studio";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Brand } from "@/components/ui/brand";
import { Button } from "@/components/ui/button";
import { Annotation, Eyebrow } from "@/components/ui/creative";
import { Icon, type IconName } from "@/components/ui/icon";
import { DemoBadge, StatusDot, Tape } from "@/components/ui/sketch";
import { requireOrganizationPermission } from "@/lib/request-auth";

const primaryNavigation: readonly {
  label: string;
  href: string;
  icon: IconName;
}[] = [
  { label: "Dashboard", href: "#dashboard", icon: "dashboard" },
  { label: "Create", href: "#create", icon: "sparkles" },
  { label: "Projects", href: "projects", icon: "projects" },
  { label: "History", href: "history", icon: "activity" },
  { label: "Assets", href: "#assets", icon: "assets" },
  { label: "Usage", href: "#usage", icon: "activity" },
];

const sampleActivity = [
  {
    name: "Ramadan campaign visual",
    model: "Seedream 5.0 Lite",
    kind: "image",
    status: "Ready",
    cost: "28",
  },
  {
    name: "Muscat launch film",
    model: "Seedance 2.5",
    kind: "video",
    status: "Processing",
    cost: "240",
  },
  {
    name: "Arabic brand narration",
    model: "Seed Speech TTS 2.0",
    kind: "voice",
    status: "Ready",
    cost: "6",
  },
] as const;

function roleLabel(role: string): string {
  return role
    .replace("ORGANIZATION_", "")
    .toLowerCase()
    .replace(/^./, (character) => character.toUpperCase());
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function OrganizationWorkspacePage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const { session, membership } = await requireOrganizationPermission(
    organizationSlug,
    "workspace:view",
  );

  const [organizations, generationCount, projectCount, assetCount, recentJobs] =
    await Promise.all([
      db.membership.findMany({
        where: {
          userId: session.user.id,
          organization: { status: "ACTIVE" },
        },
        select: {
          organization: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      db.generationJob.count({
        where: {
          organizationId: membership.organization.id,
          ...(membership.role === "ORGANIZATION_OWNER"
            ? {}
            : { createdById: session.user.id }),
        },
      }),
      db.project.count({
        where: {
          organizationId: membership.organization.id,
          archivedAt: null,
        },
      }),
      db.asset.count({
        where: {
          organizationId: membership.organization.id,
          status: "READY",
        },
      }),
      db.generationJob.findMany({
        where: {
          organizationId: membership.organization.id,
          ...(membership.role === "ORGANIZATION_OWNER"
            ? {}
            : { createdById: session.user.id }),
        },
        select: {
          id: true,
          status: true,
          chargedCredits: true,
          project: { select: { name: true } },
          providerModel: {
            select: { displayName: true, mediaKind: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

  const canAccessAdmin = hasPlatformPermission(
    session.user.platformRole,
    "platform:access",
  );
  const canGenerate = hasOrganizationPermission(
    membership.role,
    "generation:create",
  );
  const credits = membership.organization.wallet?.balanceCache ?? 0n;
  const firstName = session.user.name.split(/\s+/)[0] || "Creator";

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <div className="creative-glow pointer-events-none fixed inset-0" />
      <div className="paper-grid pointer-events-none fixed inset-x-0 top-0 h-[680px] opacity-35 [mask-image:linear-gradient(to_bottom,black,transparent)]" />

      <div className="relative mx-auto grid min-h-screen max-w-[1800px] xl:grid-cols-[264px_1fr]">
        <aside className="hidden border-r border-border bg-sidebar/88 px-4 py-5 backdrop-blur-xl xl:flex xl:flex-col">
          <div className="px-2">
            <Brand />
          </div>

          <nav className="mt-9 space-y-1.5" aria-label="Workspace navigation">
            {primaryNavigation.map((item, index) => (
              <a
                key={item.label}
                href={
                  item.label === "Projects" || item.label === "History"
                    ? `/app/${organizationSlug}/${item.href}`
                    : item.href
                }
                className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                  index === 0
                    ? "border-primary/20 bg-card text-foreground shadow-xs"
                    : "border-transparent text-muted-foreground hover:border-border hover:bg-card/60 hover:text-foreground"
                }`}
              >
                <Icon
                  name={item.icon}
                  className={`size-[18px] ${index === 0 ? "text-primary" : "text-subtle-foreground group-hover:text-foreground/90"}`}
                />
                {item.label}
                {index === 0 ? (
                  <span className="ml-auto size-1.5 rounded-full bg-primary" />
                ) : null}
              </a>
            ))}
          </nav>

          <div className="mt-8 px-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-subtle-foreground">
              Workspace
            </p>
            <div className="mt-3 space-y-1">
              <a
                href="#templates"
                className="block rounded-lg py-2 text-xs font-medium text-subtle-foreground transition hover:text-foreground/90"
              >
                Templates
              </a>
              <a
                href={`/app/${organizationSlug}/members`}
                className="block rounded-lg py-2 text-xs font-medium text-subtle-foreground transition hover:text-foreground/90"
              >
                Team members
              </a>
              <a
                href="#settings"
                className="block rounded-lg py-2 text-xs font-medium text-subtle-foreground transition hover:text-foreground/90"
              >
                Settings
              </a>
            </div>
          </div>

          <div className="mt-auto space-y-3">
            <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card p-4 shadow-sketch">
              <Tape className="-right-5 -top-1 h-4 w-16 rotate-12" />
              <div className="flex items-center justify-between">
                <span className="grid size-8 place-items-center rounded-xl bg-primary/15 text-primary">
                  <Icon name="credits" className="size-4" />
                </span>
                <StatusDot className="border-0 bg-transparent px-0">
                  Available
                </StatusDot>
              </div>
              <p className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
                {credits.toLocaleString("en-US")}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                platform credits
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]">
                <div className="h-full w-[64%] rounded-full bg-[var(--gradient-spectrum)]" />
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl px-2 py-2">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-foreground/[0.07] text-xs font-bold text-foreground/90">
                {initials(session.user.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-foreground">
                  {session.user.name}
                </span>
                <span className="mt-0.5 block truncate text-[10px] text-subtle-foreground">
                  {roleLabel(membership.role)}
                </span>
              </span>
              <SignOutButton />
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 flex min-h-[72px] items-center justify-between gap-4 border-b border-border bg-background/82 px-4 backdrop-blur-xl sm:px-7 lg:px-9">
            <div className="flex min-w-0 items-center gap-3">
              <div className="xl:hidden">
                <Brand compact />
              </div>
              <div className="hidden h-5 w-px bg-border xl:block" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {membership.organization.name}
                </p>
                <p className="mt-0.5 hidden text-[10px] font-medium uppercase tracking-[0.12em] text-subtle-foreground sm:block">
                  Creative workspace
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <ThemeToggle />
              <div className="hidden items-center gap-2 rounded-xl border border-border bg-card/70 px-3 py-2 text-xs text-subtle-foreground shadow-xs lg:flex">
                <Icon name="search" className="size-4" />
                Search projects
                <kbd className="ml-8 rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[9px] text-subtle-foreground">
                  ⌘ K
                </kbd>
              </div>
              <OrganizationSwitcher
                activeOrganizationId={membership.organization.id}
                className="hidden sm:block"
                organizations={organizations.map(
                  ({ organization }) => organization,
                )}
              />
              <button
                type="button"
                aria-label="Notifications"
                className="relative grid size-9 place-items-center rounded-xl border border-border bg-foreground/[0.03] text-muted-foreground transition hover:text-foreground"
              >
                <Icon name="bell" className="size-4" />
                <span className="absolute right-2 top-2 size-1.5 rounded-full bg-primary ring-2 ring-background" />
              </button>
              {canAccessAdmin ? (
                <Button
                  asChild
                  variant="secondary"
                  size="sm"
                  className="hidden sm:inline-flex"
                >
                  <Link href="/admin">
                    <Icon name="admin" className="size-4" /> Admin
                  </Link>
                </Button>
              ) : null}
            </div>
          </header>

          <div className="sticky top-[72px] z-20 border-b border-border bg-background/90 px-4 py-2 backdrop-blur-xl xl:hidden">
            <div className="mb-2 sm:hidden">
              <OrganizationSwitcher
                activeOrganizationId={membership.organization.id}
                className="w-full max-w-none"
                organizations={organizations.map(
                  ({ organization }) => organization,
                )}
              />
            </div>
            <nav
              className="flex gap-1 overflow-x-auto pb-0.5"
              aria-label="Mobile workspace navigation"
            >
              {primaryNavigation.map((item, index) => (
                <a
                  key={item.label}
                  href={
                    item.label === "Projects" || item.label === "History"
                      ? `/app/${organizationSlug}/${item.href}`
                      : item.href
                  }
                  className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${index === 0 ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
                >
                  <Icon name={item.icon} className="size-3.5" />
                  {item.label}
                </a>
              ))}
            </nav>
          </div>

          <div className="px-4 py-7 sm:px-7 lg:px-9 lg:py-10">
            <section
              id="dashboard"
              className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"
            >
              <div>
                <Eyebrow>Welcome back, {firstName}</Eyebrow>
                <h1 className="font-display mt-3 text-4xl font-semibold tracking-[-0.045em] text-foreground sm:text-5xl">
                  What will we make today?
                </h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                  Shape images, videos, and voices from one organized creative
                  desk.
                </p>
                <Annotation className="mt-2 hidden text-lg text-primary sm:inline-flex">
                  rough ideas welcome →
                </Annotation>
              </div>
              <Button asChild className="self-start sm:self-auto">
                <a href="#create">
                  <Icon name="plus" className="size-4" /> New creation
                </a>
              </Button>
            </section>

            <section
              className="mt-7 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4"
              aria-label="Workspace overview"
            >
              <MetricCard
                label="Available credits"
                value={credits.toLocaleString("en-US")}
                detail="Ready to create"
                icon="credits"
                accent="violet"
              />
              <MetricCard
                label="Total generations"
                value={generationCount.toLocaleString("en-US")}
                detail="All time"
                icon="sparkles"
                accent="cyan"
              />
              <MetricCard
                label="Active projects"
                value={projectCount.toLocaleString("en-US")}
                detail="Organization scope"
                icon="projects"
                accent="amber"
              />
              <MetricCard
                label="Ready assets"
                value={assetCount.toLocaleString("en-US")}
                detail="In your library"
                icon="assets"
                accent="emerald"
              />
            </section>

            <div className="mt-6">
              <GenerationStudio
                key={membership.organizationId}
                canGenerate={canGenerate}
                organizationId={membership.organizationId}
                organizationSlug={organizationSlug}
              />
            </div>

            <section
              id="projects"
              className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,.6fr)]"
            >
              <div className="rounded-[24px] border border-border bg-card/88 p-5 shadow-sm sm:p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Recent generations
                    </p>
                    <p className="mt-1 text-xs text-subtle-foreground">
                      Latest creative work in this organization
                    </p>
                  </div>
                  <Link
                    href={`/app/${organizationSlug}/projects`}
                    className="inline-flex min-h-10 items-center text-xs font-semibold text-primary transition hover:text-primary"
                  >
                    Manage projects
                  </Link>
                </div>

                {recentJobs.length > 0 ? (
                  <div className="mt-5 divide-y divide-border">
                    {recentJobs.map((job) => (
                      <ActivityRow
                        key={job.id}
                        name={
                          job.project?.name ??
                          `${job.providerModel.mediaKind.toLowerCase()} generation`
                        }
                        model={job.providerModel.displayName}
                        kind={job.providerModel.mediaKind.toLowerCase()}
                        status={job.status.replaceAll("_", " ").toLowerCase()}
                        cost={job.chargedCredits.toLocaleString("en-US")}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="mt-4">
                    <div className="mb-2 flex items-center gap-2">
                      <DemoBadge>Demo data</DemoBadge>
                      <span className="text-[10px] text-subtle-foreground">
                        Replaced automatically after your first generation
                      </span>
                    </div>
                    <div className="divide-y divide-border">
                      {sampleActivity.map((item) => (
                        <ActivityRow key={item.name} {...item} />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div
                id="usage"
                className="rounded-[24px] border border-border bg-card/88 p-5 shadow-sm sm:p-6"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Creative mix
                    </p>
                    <p className="mt-1 text-xs text-subtle-foreground">
                      Demo usage distribution
                    </p>
                  </div>
                  <DemoBadge>Illustrative</DemoBadge>
                </div>
                <div className="mt-8 flex items-center gap-6">
                  <div
                    className="relative grid size-32 shrink-0 place-items-center rounded-full"
                    style={{
                      background:
                        "conic-gradient(var(--primary) 0 52%, var(--info) 52% 81%, var(--warning) 81% 100%)",
                    }}
                  >
                    <div className="grid size-[92px] place-items-center rounded-full bg-card text-center">
                      <div>
                        <p className="text-xl font-semibold text-foreground">
                          24
                        </p>
                        <p className="text-[9px] uppercase tracking-wider text-subtle-foreground">
                          Creations
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    <Legend color="bg-primary" label="Images" value="52%" />
                    <Legend color="bg-info" label="Videos" value="29%" />
                    <Legend color="bg-warning" label="Voices" value="19%" />
                  </div>
                </div>
                <p className="mt-7 rounded-xl border border-border bg-surface-sunken px-3 py-2.5 text-[10px] leading-4 text-subtle-foreground">
                  Charts switch to live organization usage after generation
                  billing is connected.
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  icon: IconName;
  accent: "violet" | "cyan" | "amber" | "emerald";
}) {
  const accents = {
    violet: "bg-primary/10 text-primary",
    cyan: "bg-info/10 text-info",
    amber: "bg-warning/10 text-warning",
    emerald: "bg-success/10 text-success",
  };

  return (
    <article className="hover-lift group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-border bg-card/82 p-4 shadow-xs">
      <span className="absolute inset-x-0 top-0 h-0.5 bg-[var(--gradient-spectrum)] opacity-50 transition group-hover:opacity-100" />
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-xl ${accents[accent]}`}
      >
        <Icon name={icon} className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-subtle-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold tracking-tight text-foreground">
          {value}
        </p>
        <p className="mt-0.5 text-[10px] text-subtle-foreground">{detail}</p>
      </div>
    </article>
  );
}

function ActivityRow({
  name,
  model,
  kind,
  status,
  cost,
}: {
  name: string;
  model: string;
  kind: string;
  status: string;
  cost: string;
}) {
  const normalizedKind = kind.toLowerCase();
  const icon: IconName = normalizedKind.includes("video")
    ? "video"
    : normalizedKind.includes("voice") || normalizedKind.includes("speech")
      ? "voice"
      : "image";
  const successful =
    status.toLowerCase() === "ready" || status.toLowerCase() === "succeeded";

  return (
    <div className="flex items-center gap-3 py-3.5 first:pt-1 last:pb-0">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-surface-sunken text-muted-foreground">
        <Icon name={icon} className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold capitalize text-foreground">
          {name}
        </p>
        <p className="mt-1 truncate text-[10px] text-subtle-foreground">
          {model}
        </p>
      </div>
      <span
        className={`hidden rounded-full px-2.5 py-1 text-[9px] font-bold capitalize sm:inline-flex ${successful ? "bg-success/10 text-success" : "bg-primary/10 text-primary"}`}
      >
        {status}
      </span>
      <div className="w-16 text-right">
        <p className="text-xs font-semibold text-foreground/90">{cost}</p>
        <p className="mt-0.5 text-[9px] text-subtle-foreground">credits</p>
      </div>
    </div>
  );
}

function Legend({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`size-2 rounded-full ${color}`} />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-semibold text-foreground/90">{value}</span>
    </div>
  );
}
