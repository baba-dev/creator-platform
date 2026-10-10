import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import type { Route } from "next";
import Link from "next/link";

import { GenerationStudio } from "@/components/studio/generation-studio";
import { TemplateCard } from "@/components/templates/template-card";
import { RecentCreations } from "@/components/dashboard/recent-creations";
import { StartConversationButton } from "@/components/conversations/start-conversation-button";
import { Button } from "@/components/ui/button";
import { Annotation, Eyebrow } from "@/components/ui/creative";
import { Icon, type IconName } from "@/components/ui/icon";
import { mediaGenerationJobFilter } from "@/lib/media-generation-query";
import { requireOrganizationPermission } from "@/lib/request-auth";
import { getAvailableStudioModels } from "@/lib/studio-model-discovery";

type MediaKind = "IMAGE" | "VIDEO" | "VOICE" | "TEXT";

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

  const [
    generationCount,
    projectCount,
    assetCount,
    recentJobs,
    mixCounts,
    topTemplates,
    promptEnhancement,
  ] = await Promise.all([
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
        ...mediaGenerationJobFilter(),
      },
      select: {
        id: true,
        status: true,
        chargedCredits: true,
        reservedCredits: true,
        requestPayload: true,
        createdAt: true,
        assets: {
          where: { status: "READY", deletedAt: null },
          select: {
            id: true,
            mimeType: true,
            variants: {
              where: { kind: { in: ["THUMBNAIL", "POSTER", "WAVEFORM"] } },
              select: { kind: true },
            },
          },
          orderBy: { generationOutputIndex: "asc" },
          take: 1,
        },
        project: { select: { name: true } },
        providerModel: {
          select: { displayName: true, mediaKind: true },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 3,
    }),
    db.generationJob.groupBy({
      by: ["providerModelId"],
      where: {
        organizationId: membership.organization.id,
        ...(membership.role === "ORGANIZATION_OWNER"
          ? {}
          : { createdById: session.user.id }),
      },
      _count: { _all: true },
    }),
    db.generationTemplate.findMany({
      where: {
        status: "PUBLISHED",
        mediaKind: { in: ["IMAGE", "VIDEO", "VOICE"] },
      },
      orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
      take: 4,
      select: {
        slug: true,
        name: true,
        description: true,
        mediaKind: true,
        coverObjectKey: true,
        coverAlt: true,
        coverIcon: true,
        updatedAt: true,
      },
    }),
    getAvailableStudioModels("prompt-enhancement"),
  ]);

  const modelKinds = await db.providerModel.findMany({
    where: { id: { in: mixCounts.map((group) => group.providerModelId) } },
    select: { id: true, mediaKind: true },
  });
  const kindByModel = new Map(
    modelKinds.map((model) => [model.id, model.mediaKind]),
  );
  const mix = { IMAGE: 0, VIDEO: 0, VOICE: 0, TEXT: 0 };
  for (const group of mixCounts) {
    const kind = kindByModel.get(group.providerModelId);
    if (kind && kind in mix) mix[kind as MediaKind] += group._count._all;
  }
  const mixTotal = mix.IMAGE + mix.VIDEO + mix.VOICE + mix.TEXT;
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
          <div className="flex flex-wrap items-start gap-2">
            {canGenerate ? (
              <StartConversationButton
                organizationId={membership.organizationId}
                organizationSlug={organizationSlug}
              />
            ) : null}
            <Button asChild className="self-start sm:self-auto">
              <a href="#create">
                <Icon name="plus" className="size-4" /> New creation
              </a>
            </Button>
          </div>
        </section>

        <section
          className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
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
            promptEnhancementModels={promptEnhancement.models}
            promptEnhancementDefaultModelId={promptEnhancement.defaultModelId}
          />
        </div>

        <section
          className="mt-6 rounded-[24px] border border-border bg-card/88 p-5 shadow-sm sm:p-6"
          aria-labelledby="dashboard-templates"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <Eyebrow>Ready-made starting points</Eyebrow>
              <h2
                id="dashboard-templates"
                className="font-display mt-2 text-xl font-semibold text-foreground"
              >
                Start from a template
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose a look and start creating. Your Studio is prepared for
                you.
              </p>
            </div>
            <Link
              href={`/app/${organizationSlug}/templates`}
              className="inline-flex min-h-10 items-center text-sm font-semibold text-primary hover:underline"
            >
              Explore all templates →
            </Link>
          </div>
          {topTemplates.length ? (
            <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
              {topTemplates.map((template) => (
                <TemplateCard
                  key={template.slug}
                  template={{
                    ...template,
                    mediaKind: template.mediaKind as
                      "IMAGE" | "VIDEO" | "VOICE",
                    coverVersion: template.updatedAt.getTime(),
                  }}
                  organizationSlug={organizationSlug}
                  compact
                />
              ))}
            </div>
          ) : (
            <p className="mt-5 rounded-xl border border-border bg-surface-sunken p-4 text-sm text-muted-foreground">
              Published templates will appear here when available.
            </p>
          )}
        </section>

        <section
          id="projects"
          className="mt-6 grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,.5fr)]"
        >
          <RecentCreations
            jobs={recentJobs.map((job) => ({
              id: job.id,
              status: job.status,
              createdAt: job.createdAt,
              chargedCredits: job.chargedCredits.toString(),
              reservedCredits: job.reservedCredits.toString(),
              requestPayload: job.requestPayload,
              modelName: job.providerModel.displayName,
              mediaKind: job.providerModel.mediaKind as
                "IMAGE" | "VIDEO" | "VOICE",
              asset: job.assets[0] ?? null,
            }))}
            organizationId={membership.organizationId}
            organizationSlug={organizationSlug}
          />
          <div
            id="usage"
            className="min-w-0 self-start rounded-[24px] border border-border bg-card/88 p-5 shadow-sm sm:p-6"
          >
            <Eyebrow>Explore your tools</Eyebrow>
            <h2 className="font-display mt-2 text-xl font-semibold text-foreground">
              Go further with Studio
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {mixTotal.toLocaleString("en-US")} generations made. Pick a
              dedicated workspace for finer control.
            </p>
            <div className="mt-5 space-y-2">
              <StudioPath
                slug={organizationSlug}
                kind="image"
                count={mix.IMAGE}
                title="Image studio"
                detail="References, variations and edits"
                tone="bg-primary/10 text-primary"
              />
              <StudioPath
                slug={organizationSlug}
                kind="video"
                count={mix.VIDEO}
                title="Video studio"
                detail="Frames, timing and composition"
                tone="bg-info/10 text-info"
              />
              <StudioPath
                slug={organizationSlug}
                kind="speech"
                count={mix.VOICE}
                title="Speech studio"
                detail="Voices, pacing and narration"
                tone="bg-warning/10 text-warning"
              />
              <StudioPath
                slug={organizationSlug}
                kind="chat"
                count={mix.TEXT}
                title="Character chat"
                detail="Personas, dialogues and reasoning"
                tone="bg-success/10 text-success"
              />
            </div>
            <div className="mt-5 rounded-2xl border border-border bg-surface-sunken p-4">
              <p className="text-xs font-semibold text-foreground">
                Keep your work together
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {projectCount} active projects · {assetCount} ready assets
              </p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-primary">
                <Link
                  href={`/app/${organizationSlug}/projects`}
                  className="hover:underline"
                >
                  Projects →
                </Link>
                <Link
                  href={`/app/${organizationSlug}/assets`}
                  className="hover:underline"
                >
                  Asset library →
                </Link>
              </div>
            </div>
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

function StudioPath({
  slug,
  kind,
  count,
  title,
  detail,
  tone,
}: {
  slug: string;
  kind: "image" | "video" | "speech" | "chat";
  count: number;
  title: string;
  detail: string;
  tone: string;
}) {
  return (
    <Link
      href={`/app/${slug}/${kind}` as Route}
      className="group flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-card p-3 transition hover:border-primary/40 hover:bg-primary/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-xl ${tone}`}
      >
        <Icon name={kind === "speech" ? "voice" : kind} className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">
          {title}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {detail}
        </span>
      </span>
      <span className="text-right">
        <span className="block text-sm font-semibold tabular-nums text-foreground">
          {count}
        </span>
        <span className="text-[10px] text-subtle-foreground">made</span>
      </span>
      <span
        aria-hidden="true"
        className="text-primary transition group-hover:translate-x-0.5"
      >
        →
      </span>
    </Link>
  );
}
