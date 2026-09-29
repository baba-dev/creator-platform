import { db } from "@aiwa/db";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TemplateComposer } from "@/components/templates/template-composer";
import { Eyebrow } from "@/components/ui/creative";
import { Icon } from "@/components/ui/icon";
import { requireOrganizationPermission } from "@/lib/request-auth";
import { parseTemplateDefaults, parseTemplateVariables } from "@/lib/templates";

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; slug: string }>;
}) {
  const { organizationSlug, slug } = await params;
  const { session, membership } = await requireOrganizationPermission(
    organizationSlug,
    "workspace:view",
  );

  const template = await db.generationTemplate.findFirst({
    where: {
      slug,
      status: "PUBLISHED",
      mediaKind: { in: ["IMAGE", "VIDEO", "VOICE"] },
    },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      category: true,
      mediaKind: true,
      promptTemplate: true,
      variables: true,
      defaultInput: true,
      preferredModelId: true,
      featured: true,
      _count: { select: { generationJobs: true } },
    },
  });
  if (!template) notFound();

  let variables;
  let defaults;
  try {
    variables = parseTemplateVariables(template.variables);
    defaults = parseTemplateDefaults(template.defaultInput);
  } catch {
    notFound();
  }

  const needsReferences = variables.some(
    (variable) => variable.type === "reference-image",
  );
  const referenceAssets = needsReferences
    ? await db.asset.findMany({
        where: {
          organizationId: membership.organizationId,
          storageOwnerUserId: session.user.id,
          purpose: "REFERENCE_INPUT",
          mediaKind: "IMAGE",
          status: "READY",
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          name: true,
          originalFilename: true,
        },
      })
    : [];

  const mediaIcon =
    template.mediaKind === "IMAGE"
      ? "image"
      : template.mediaKind === "VIDEO"
        ? "video"
        : "voice";

  return (
    <main className="relative min-w-0 bg-background text-foreground">
      <div className="creative-glow pointer-events-none fixed inset-0" />
      <div className="paper-grid pointer-events-none fixed inset-x-0 top-0 h-[620px] opacity-25 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div className="relative mx-auto max-w-[1320px] px-4 py-8 sm:px-7 lg:px-10 lg:py-10">
        <Link
          href={`/app/${organizationSlug}/templates`}
          className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-primary"
        >
          <span aria-hidden="true">←</span> All templates
        </Link>

        <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1.18fr)_minmax(360px,.82fr)] lg:items-start">
          <div>
            <div className="relative overflow-hidden rounded-[32px] border border-border bg-card shadow-sm">
              <div className="relative aspect-[16/9] overflow-hidden bg-surface-sunken">
                <div className="paper-grid absolute inset-0 opacity-55" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,hsl(var(--primary)/.26),transparent_35%),radial-gradient(circle_at_82%_78%,hsl(var(--info)/.16),transparent_34%)]" />
                <div className="absolute inset-0 grid place-items-center">
                  <span className="grid size-28 place-items-center rounded-[34px] border border-white/10 bg-background/70 text-primary shadow-sketch backdrop-blur-xl">
                    <Icon name={mediaIcon} className="size-12" />
                  </span>
                </div>
                <div className="absolute left-6 top-6 flex gap-2">
                  {template.featured ? (
                    <span className="rounded-full border border-primary/20 bg-background/80 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-primary backdrop-blur">
                      Featured
                    </span>
                  ) : null}
                  <span className="rounded-full border border-border bg-background/80 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground backdrop-blur">
                    {template.category}
                  </span>
                </div>
              </div>
              <div className="p-6 sm:p-8">
                <Eyebrow>{template.mediaKind.toLowerCase()} template</Eyebrow>
                <h1 className="font-display mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
                  {template.name}
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {template.description}
                </p>

                <div className="mt-6 flex flex-wrap gap-2">
                  {defaults.aspectRatio ? (
                    <MetaPill>{defaults.aspectRatio}</MetaPill>
                  ) : null}
                  {defaults.resolution ? (
                    <MetaPill>{defaults.resolution}</MetaPill>
                  ) : null}
                  {defaults.outputCount && defaults.outputCount > 1 ? (
                    <MetaPill>{defaults.outputCount} outputs</MetaPill>
                  ) : null}
                  {defaults.durationSeconds ? (
                    <MetaPill>{defaults.durationSeconds}s</MetaPill>
                  ) : null}
                  <MetaPill>
                    {variables.length} brief field
                    {variables.length === 1 ? "" : "s"}
                  </MetaPill>
                </div>

                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  <TrustPoint
                    icon="wand"
                    title="Guided brief"
                    body="No prompt-engineering syntax required."
                  />
                  <TrustPoint
                    icon="sparkles"
                    title="Live compatibility"
                    body="Only an enabled compatible model is selected."
                  />
                  <TrustPoint
                    icon="credits"
                    title="No instant charge"
                    body="Review everything in Studio before generation."
                  />
                </div>
              </div>
            </div>

            <section className="mt-6 rounded-[24px] border border-border bg-card/75 p-5 sm:p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                How this template works
              </p>
              <ol className="mt-4 grid gap-3 sm:grid-cols-3">
                <Step
                  number="01"
                  title="Answer the brief"
                  body="Provide only the creative context this recipe needs."
                />
                <Step
                  number="02"
                  title="Open Studio"
                  body="Creator resolves the prompt and compatible model settings."
                />
                <Step
                  number="03"
                  title="Review & generate"
                  body="Adjust anything you want, then confirm the paid generation."
                />
              </ol>
            </section>
          </div>

          <div className="lg:sticky lg:top-[96px]">
            <TemplateComposer
              organizationId={membership.organizationId}
              organizationSlug={organizationSlug}
              template={{
                slug: template.slug,
                name: template.name,
                mediaKind: template.mediaKind as "IMAGE" | "VIDEO" | "VOICE",
                defaultInput: defaults,
              }}
              variables={variables}
              referenceAssets={referenceAssets}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

function MetaPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-xl border border-border bg-surface-sunken px-3 py-2 text-xs font-semibold">
      {children}
    </span>
  );
}

function TrustPoint({
  icon,
  title,
  body,
}: {
  icon: "wand" | "sparkles" | "credits";
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface-sunken p-4">
      <Icon name={icon} className="size-4 text-primary" />
      <p className="mt-3 text-xs font-semibold">{title}</p>
      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{body}</p>
    </div>
  );
}

function Step({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <li className="rounded-2xl bg-surface-sunken p-4">
      <p className="font-mono text-[10px] font-bold text-primary">{number}</p>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{body}</p>
    </li>
  );
}
