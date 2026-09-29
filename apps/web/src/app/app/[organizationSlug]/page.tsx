import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import Link from "next/link";

import { GenerationStudio } from "@/components/studio/generation-studio";
import { Button } from "@/components/ui/button";
import { Annotation, Eyebrow } from "@/components/ui/creative";
import { Icon, type IconName } from "@/components/ui/icon";
import { DemoBadge } from "@/components/ui/sketch";
import { requireOrganizationPermission } from "@/lib/request-auth";

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

  const [generationCount, projectCount, assetCount, recentJobs] =
    await Promise.all([
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

      <div className="mx-auto max-w-[1600px] min-w-0 px-4 py-7 sm:px-7 lg:px-9 lg:py-10">
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
              Shape images, videos, and voices from one organized creative desk.
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
            variant="quick"
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
                    <p className="text-xl font-semibold text-foreground">24</p>
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
              Charts switch to live organization usage after generation billing
              is connected.
            </p>
          </div>
        </section>
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
