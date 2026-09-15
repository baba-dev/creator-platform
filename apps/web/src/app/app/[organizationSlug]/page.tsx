import { hasOrganizationPermission, hasPlatformPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import Link from "next/link";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { OrganizationSwitcher } from "@/components/organizations/organization-switcher";
import { GenerationStudio } from "@/components/studio/generation-studio";
import { Brand } from "@/components/ui/brand";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { requireOrganizationPermission } from "@/lib/request-auth";

const primaryNavigation: readonly {
  label: string;
  href: `#${string}`;
  icon: IconName;
}[] = [
  { label: "Dashboard", href: "#dashboard", icon: "dashboard" },
  { label: "Create", href: "#create", icon: "sparkles" },
  { label: "Projects", href: "#projects", icon: "projects" },
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
        where: { organizationId: membership.organization.id },
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
        where: { organizationId: membership.organization.id },
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
    <main className="min-h-screen bg-[#070912] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_72%_-10%,rgba(124,58,237,.16),transparent_35rem),radial-gradient(circle_at_15%_80%,rgba(6,182,212,.08),transparent_30rem)]" />

      <div className="relative mx-auto grid min-h-screen max-w-[1800px] xl:grid-cols-[250px_1fr]">
        <aside className="hidden border-r border-white/[0.07] bg-[#080b13]/80 px-4 py-5 backdrop-blur-xl xl:flex xl:flex-col">
          <div className="px-2">
            <Brand />
          </div>

          <nav className="mt-9 space-y-1" aria-label="Workspace navigation">
            {primaryNavigation.map((item, index) => (
              <a
                key={item.label}
                href={item.href}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  index === 0
                    ? "bg-white/[0.075] text-white shadow-sm"
                    : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-200"
                }`}
              >
                <Icon
                  name={item.icon}
                  className={`size-[18px] ${index === 0 ? "text-violet-300" : "text-slate-600 group-hover:text-slate-300"}`}
                />
                {item.label}
                {index === 0 ? (
                  <span className="ml-auto size-1.5 rounded-full bg-violet-400" />
                ) : null}
              </a>
            ))}
          </nav>

          <div className="mt-8 px-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-700">
              Workspace
            </p>
            <div className="mt-3 space-y-1">
              <a
                href="#templates"
                className="block rounded-lg py-2 text-xs font-medium text-slate-600 transition hover:text-slate-300"
              >
                Templates
              </a>
              <a
                href="#team"
                className="block rounded-lg py-2 text-xs font-medium text-slate-600 transition hover:text-slate-300"
              >
                Team members
              </a>
              <a
                href="#settings"
                className="block rounded-lg py-2 text-xs font-medium text-slate-600 transition hover:text-slate-300"
              >
                Settings
              </a>
            </div>
          </div>

          <div className="mt-auto space-y-3">
            <div className="overflow-hidden rounded-2xl border border-violet-300/10 bg-[linear-gradient(145deg,rgba(124,58,237,.12),rgba(6,182,212,.05))] p-4">
              <div className="flex items-center justify-between">
                <span className="grid size-8 place-items-center rounded-xl bg-violet-400/15 text-violet-200">
                  <Icon name="credits" className="size-4" />
                </span>
                <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-300">
                  Available
                </span>
              </div>
              <p className="mt-4 text-2xl font-semibold tracking-tight text-white">
                {credits.toLocaleString("en-US")}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                platform credits
              </p>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full w-[64%] rounded-full bg-gradient-to-r from-violet-400 to-cyan-400" />
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl px-2 py-2">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.07] text-xs font-bold text-slate-300">
                {initials(session.user.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-slate-200">
                  {session.user.name}
                </span>
                <span className="mt-0.5 block truncate text-[10px] text-slate-600">
                  {roleLabel(membership.role)}
                </span>
              </span>
              <SignOutButton />
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 flex min-h-[72px] items-center justify-between gap-4 border-b border-white/[0.07] bg-[#070912]/80 px-4 backdrop-blur-xl sm:px-7 lg:px-9">
            <div className="flex min-w-0 items-center gap-3">
              <div className="xl:hidden">
                <Brand compact />
              </div>
              <div className="hidden h-5 w-px bg-white/10 xl:block" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {membership.organization.name}
                </p>
                <p className="mt-0.5 hidden text-[10px] font-medium uppercase tracking-[0.12em] text-slate-600 sm:block">
                  Creative workspace
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-xs text-slate-600 lg:flex">
                <Icon name="search" className="size-4" />
                Search projects
                <kbd className="ml-8 rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] text-slate-600">
                  ⌘ K
                </kbd>
              </div>
              <OrganizationSwitcher
                activeOrganizationId={membership.organization.id}
                organizations={organizations.map(
                  ({ organization }) => organization,
                )}
              />
              <button
                type="button"
                aria-label="Notifications"
                className="relative grid size-9 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-slate-500 transition hover:text-white"
              >
                <Icon name="bell" className="size-4" />
                <span className="absolute right-2 top-2 size-1.5 rounded-full bg-violet-400 ring-2 ring-[#090b14]" />
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

          <div className="px-4 py-7 sm:px-7 lg:px-9 lg:py-9">
            <section
              id="dashboard"
              className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"
            >
              <div>
                <p className="text-xs font-semibold text-violet-300">
                  Welcome back, {firstName}
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">
                  Bring your next idea to life.
                </h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
                  Create images, videos, and voices from one controlled
                  workspace.
                </p>
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
              <GenerationStudio canGenerate={canGenerate} />
            </div>

            <section
              id="projects"
              className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,.6fr)]"
            >
              <div className="rounded-[26px] border border-white/[0.08] bg-[#0c101a]/85 p-5 sm:p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Recent generations
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Latest creative work in this organization
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-semibold text-violet-300 transition hover:text-violet-200"
                  >
                    View all
                  </button>
                </div>

                {recentJobs.length > 0 ? (
                  <div className="mt-5 divide-y divide-white/[0.06]">
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
                      <span className="rounded-md bg-amber-300/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-amber-300">
                        Demo data
                      </span>
                      <span className="text-[10px] text-slate-700">
                        Replaced automatically after your first generation
                      </span>
                    </div>
                    <div className="divide-y divide-white/[0.06]">
                      {sampleActivity.map((item) => (
                        <ActivityRow key={item.name} {...item} />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div
                id="usage"
                className="rounded-[26px] border border-white/[0.08] bg-[#0c101a]/85 p-5 sm:p-6"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Creative mix
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Demo usage distribution
                    </p>
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-700">
                    This month
                  </span>
                </div>
                <div className="mt-8 flex items-center gap-6">
                  <div
                    className="relative grid size-32 shrink-0 place-items-center rounded-full"
                    style={{
                      background:
                        "conic-gradient(#8b5cf6 0 52%, #22d3ee 52% 81%, #f59e0b 81% 100%)",
                    }}
                  >
                    <div className="grid size-[92px] place-items-center rounded-full bg-[#0c101a] text-center">
                      <div>
                        <p className="text-xl font-semibold text-white">24</p>
                        <p className="text-[9px] uppercase tracking-wider text-slate-600">
                          Creations
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    <Legend color="bg-violet-500" label="Images" value="52%" />
                    <Legend color="bg-cyan-400" label="Videos" value="29%" />
                    <Legend color="bg-amber-400" label="Voices" value="19%" />
                  </div>
                </div>
                <p className="mt-7 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5 text-[10px] leading-4 text-slate-600">
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
    violet: "bg-violet-400/10 text-violet-300",
    cyan: "bg-cyan-400/10 text-cyan-300",
    amber: "bg-amber-400/10 text-amber-300",
    emerald: "bg-emerald-400/10 text-emerald-300",
  };

  return (
    <article className="flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition hover:border-white/[0.12] hover:bg-white/[0.035]">
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-xl ${accents[accent]}`}
      >
        <Icon name={icon} className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-slate-600">{label}</p>
        <p className="mt-1 text-xl font-semibold tracking-tight text-white">
          {value}
        </p>
        <p className="mt-0.5 text-[10px] text-slate-700">{detail}</p>
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
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-slate-400">
        <Icon name={icon} className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold capitalize text-slate-200">
          {name}
        </p>
        <p className="mt-1 truncate text-[10px] text-slate-600">{model}</p>
      </div>
      <span
        className={`hidden rounded-full px-2.5 py-1 text-[9px] font-bold capitalize sm:inline-flex ${successful ? "bg-emerald-400/10 text-emerald-300" : "bg-violet-400/10 text-violet-300"}`}
      >
        {status}
      </span>
      <div className="w-16 text-right">
        <p className="text-xs font-semibold text-slate-300">{cost}</p>
        <p className="mt-0.5 text-[9px] text-slate-700">credits</p>
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
      <span className="text-slate-500">{label}</span>
      <span className="ml-auto font-semibold text-slate-300">{value}</span>
    </div>
  );
}
