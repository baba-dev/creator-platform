import { db } from "@aiwa/db";
import Link from "next/link";

import {
  TemplateLibrary,
  type TemplateCardData,
} from "@/components/templates/template-library";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Brand } from "@/components/ui/brand";
import { Eyebrow } from "@/components/ui/creative";
import { Icon } from "@/components/ui/icon";
import { requireOrganizationPermission } from "@/lib/request-auth";

export default async function TemplatesPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const { session, membership } = await requireOrganizationPermission(
    organizationSlug,
    "workspace:view",
  );

  const [templates, recentJobs] = await Promise.all([
    db.generationTemplate.findMany({
      where: {
        status: "PUBLISHED",
        mediaKind: { in: ["IMAGE", "VIDEO", "VOICE"] },
      },
      orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        category: true,
        mediaKind: true,
        featured: true,
        defaultInput: true,
        favorites: {
          where: { userId: session.user.id },
          select: { userId: true },
        },
        _count: { select: { generationJobs: true } },
      },
    }),
    db.generationJob.findMany({
      where: {
        organizationId: membership.organizationId,
        createdById: session.user.id,
        templateId: { not: null },
        template: { status: "PUBLISHED" },
      },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { templateId: true },
    }),
  ]);

  const recentTemplateIds = Array.from(
    new Set(
      recentJobs
        .map((job) => job.templateId)
        .filter((id): id is string => Boolean(id)),
    ),
  ).slice(0, 6);

  const cards: TemplateCardData[] = templates.map(
    ({ favorites, _count, defaultInput, ...template }) => ({
      ...template,
      mediaKind: template.mediaKind as "IMAGE" | "VIDEO" | "VOICE",
      defaultInput:
        defaultInput &&
        typeof defaultInput === "object" &&
        !Array.isArray(defaultInput)
          ? (defaultInput as Record<string, unknown>)
          : {},
      favorite: favorites.length > 0,
      usageCount: _count.generationJobs,
    }),
  );

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <div className="creative-glow pointer-events-none fixed inset-0" />
      <div className="paper-grid pointer-events-none fixed inset-x-0 top-0 h-[620px] opacity-30 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <header className="sticky top-0 z-30 flex min-h-[72px] items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur-xl sm:px-7 lg:px-10">
        <div className="flex items-center gap-4">
          <Brand />
          <div className="hidden h-5 w-px bg-border sm:block" />
          <p className="hidden text-xs font-semibold text-muted-foreground sm:block">
            {membership.organization.name}
          </p>
        </div>
        <ThemeToggle />
      </header>

      <div className="relative mx-auto max-w-[1500px] px-4 py-8 sm:px-7 lg:px-10 lg:py-10">
        <Link
          href={`/app/${organizationSlug}`}
          className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-primary"
        >
          <span aria-hidden="true">←</span> Workspace
        </Link>

        <section className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Eyebrow>Creative starting points</Eyebrow>
            <h1 className="font-display mt-3 max-w-3xl text-4xl font-semibold tracking-[-0.045em] sm:text-5xl lg:text-6xl">
              Skip the blank canvas.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Start from a thoughtfully configured creative recipe, answer a
              short brief, then keep full control in Studio before anything is
              generated.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-border bg-card/75 p-2 shadow-xs backdrop-blur">
            <FormatStat icon="image" label="Images" value={cards.filter((item) => item.mediaKind === "IMAGE").length} />
            <FormatStat icon="video" label="Video" value={cards.filter((item) => item.mediaKind === "VIDEO").length} />
            <FormatStat icon="voice" label="Voice" value={cards.filter((item) => item.mediaKind === "VOICE").length} />
          </div>
        </section>

        <div className="mt-10">
          <TemplateLibrary
            templates={cards}
            organizationId={membership.organizationId}
            organizationSlug={organizationSlug}
            recentTemplateIds={recentTemplateIds}
          />
        </div>
      </div>
    </main>
  );
}

function FormatStat({
  icon,
  label,
  value,
}: {
  icon: "image" | "video" | "voice";
  label: string;
  value: number;
}) {
  return (
    <div className="min-w-20 rounded-xl px-3 py-2 text-center">
      <Icon name={icon} className="mx-auto size-4 text-primary" />
      <p className="mt-1.5 text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
