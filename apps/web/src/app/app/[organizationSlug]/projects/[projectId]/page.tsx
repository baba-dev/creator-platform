import { db } from "@aiwa/db";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Brand } from "@/components/ui/brand";
import { Icon } from "@/components/ui/icon";
import { StatusDot } from "@/components/ui/sketch";
import { requireOrganizationPermission } from "@/lib/request-auth";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;
  const { membership } = await requireOrganizationPermission(
    organizationSlug,
    "projects:read",
  );
  const project = await db.project.findFirst({
    where: { id: projectId, organizationId: membership.organizationId },
    include: {
      generationJobs: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          createdAt: true,
          chargedCredits: true,
          providerModel: { select: { displayName: true, mediaKind: true } },
          assets: {
            where: { status: "READY" },
            select: { id: true, mimeType: true },
          },
        },
      },
      _count: { select: { generationJobs: true, assets: true } },
    },
  });
  if (!project) notFound();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 flex min-h-[72px] items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur-xl sm:px-7 lg:px-10">
        <Brand />
        <ThemeToggle />
      </header>
      <div className="mx-auto max-w-[1300px] px-4 py-8 sm:px-7 lg:px-10">
        <Link
          href={`/app/${organizationSlug}/projects`}
          className="inline-flex min-h-10 items-center text-sm font-semibold text-primary"
        >
          ← Projects
        </Link>
        <section className="mt-4 rounded-[28px] border border-border bg-card/88 p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-subtle-foreground">
                Project
              </p>
              <h1 className="font-display mt-2 text-4xl font-semibold tracking-[-0.04em] text-foreground">
                {project.name}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                {project.description || "No project description."}
              </p>
            </div>
            <StatusDot tone={project.archivedAt ? "warning" : "success"}>
              {project.archivedAt ? "Archived" : "Active"}
            </StatusDot>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-surface-sunken p-4">
              <p className="text-xs text-subtle-foreground">Generations</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {project._count.generationJobs}
              </p>
            </div>
            <div className="rounded-xl bg-surface-sunken p-4">
              <p className="text-xs text-subtle-foreground">Assets</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {project._count.assets}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[24px] border border-border bg-card/88 p-5 shadow-sm sm:p-6">
          <h2 className="font-display text-xl font-semibold text-foreground">
            Recent generations
          </h2>
          {project.generationJobs.length ? (
            <div className="mt-4 divide-y divide-border">
              {project.generationJobs.map((job) => (
                <article
                  key={job.id}
                  className="flex flex-wrap items-center gap-3 py-4"
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-surface-sunken text-muted-foreground">
                    <Icon
                      name={
                        job.providerModel.mediaKind === "VIDEO"
                          ? "video"
                          : job.providerModel.mediaKind === "VOICE"
                            ? "voice"
                            : "image"
                      }
                      className="size-4"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {job.providerModel.displayName}
                    </p>
                    <p className="mt-1 text-xs text-subtle-foreground">
                      {job.createdAt.toLocaleString("en-GB")}
                    </p>
                  </div>
                  <StatusDot
                    tone={
                      job.status === "SUCCEEDED"
                        ? "success"
                        : job.status === "FAILED"
                          ? "warning"
                          : "info"
                    }
                  >
                    {job.status.replaceAll("_", " ").toLowerCase()}
                  </StatusDot>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {job.chargedCredits.toLocaleString("en-US")} credits
                  </span>
                  {job.assets[0] ? (
                    <a
                      href={`/api/assets/${job.assets[0].id}`}
                      className="text-xs font-semibold text-primary"
                    >
                      View asset
                    </a>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
              No generations are assigned to this project yet. Choose this
              project in Studio before generating.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
