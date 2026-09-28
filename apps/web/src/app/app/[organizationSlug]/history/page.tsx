import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@aiwa/db";
import { Brand } from "@/components/ui/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  historyQuerySchema,
  listGenerationHistory,
} from "@/lib/generation-history";
import { requireOrganizationPermission } from "@/lib/request-auth";

export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organizationSlug } = await params;
  const { session, membership } = await requireOrganizationPermission(
    organizationSlug,
    "workspace:view",
  );
  const raw = await searchParams;
  const parsed = historyQuerySchema.safeParse({
    ...Object.fromEntries(
      Object.entries(raw).filter(([, value]) => value !== ""),
    ),
    organizationId: membership.organizationId,
  });
  if (!parsed.success) notFound();
  let result;
  try {
    result = await listGenerationHistory(parsed.data, session.user.id);
  } catch {
    notFound();
  }
  if (!result) notFound();
  const [projects, creators] = await Promise.all([
    db.project.findMany({
      where: { organizationId: membership.organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    membership.role === "ORGANIZATION_OWNER"
      ? db.membership.findMany({
          where: { organizationId: membership.organizationId },
          select: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(raw))
    if (typeof value === "string" && name !== "cursor") query.set(name, value);
  const base = `/app/${organizationSlug}/history`;
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="flex min-h-[72px] items-center justify-between border-b border-border bg-background px-4 sm:px-8">
        <Brand />
        <ThemeToggle />
      </header>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-8">
        <Link
          href={`/app/${organizationSlug}`}
          className="text-sm font-semibold text-primary"
        >
          ← Workspace
        </Link>
        <div>
          <p className="text-sm font-semibold text-primary">Studio archive</p>
          <h1 className="font-display text-3xl font-bold">
            Generation history
          </h1>
          <p className="mt-2 text-muted-foreground">
            Find creations, inspect charges, and open available media.
          </p>
        </div>
        <form
          action={base}
          className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-4"
        >
          <label className="text-sm">
            Search job or prompt
            <input
              name="search"
              defaultValue={parsed.data.search}
              maxLength={100}
              className="mt-1 w-full rounded-xl border border-border bg-background p-2 text-foreground"
            />
          </label>
          <label className="text-sm">
            Media
            <select
              name="kind"
              defaultValue={parsed.data.kind ?? ""}
              className="mt-1 w-full rounded-xl border border-border bg-background p-2"
            >
              <option value="">All</option>
              <option value="IMAGE">Images</option>
              <option value="VIDEO">Videos</option>
              <option value="VOICE">Voice</option>
            </select>
          </label>
          <label className="text-sm">
            Status
            <select
              name="status"
              defaultValue={parsed.data.status ?? ""}
              className="mt-1 w-full rounded-xl border border-border bg-background p-2"
            >
              <option value="">All</option>
              {[
                "QUEUED",
                "SUBMITTED",
                "PROCESSING",
                "SUCCEEDED",
                "FAILED",
                "CANCELLED",
                "MANUAL_REVIEW",
              ].map((status) => (
                <option key={status} value={status}>
                  {status.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Project
            <select
              name="projectId"
              defaultValue={parsed.data.projectId ?? ""}
              className="mt-1 w-full rounded-xl border border-border bg-background p-2"
            >
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          {membership.role === "ORGANIZATION_OWNER" && (
            <label className="text-sm">
              Creator
              <select
                name="creatorId"
                defaultValue={parsed.data.creatorId ?? ""}
                className="mt-1 w-full rounded-xl border border-border bg-background p-2"
              >
                <option value="">Everyone</option>
                {creators.map(({ user }) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-sm">
            From (Oman time)
            <input
              name="from"
              type="date"
              defaultValue={parsed.data.from ?? ""}
              className="mt-1 w-full rounded-xl border border-border bg-background p-2"
            />
          </label>
          <label className="text-sm">
            Through (Oman time)
            <input
              name="to"
              type="date"
              defaultValue={parsed.data.to ?? ""}
              className="mt-1 w-full rounded-xl border border-border bg-background p-2"
            />
          </label>
          <button
            type="submit"
            className="self-end rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground"
          >
            Search
          </button>
        </form>
        {result.jobs.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-8 text-muted-foreground">
            No generations match these filters.
          </p>
        ) : (
          <div className="space-y-3">
            {result.jobs.map((job) => (
              <Link
                key={job.id}
                href={`/app/${organizationSlug}/history/${job.id}`}
                className="block rounded-2xl border border-border bg-card p-4 transition hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{job.providerModel.displayName}</strong>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs">
                    {job.status.replaceAll("_", " ")}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {job.providerModel.mediaKind} ·{" "}
                  {job.project?.name ?? "No project"} · {job.createdBy.name} ·{" "}
                  {job.createdAt.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {job.id} ·{" "}
                  {job.status === "SUCCEEDED"
                    ? job.chargedCredits + " credits charged"
                    : job.status === "FAILED" || job.status === "CANCELLED"
                      ? "Credits released"
                      : job.reservedCredits + " credits reserved"}
                </p>
              </Link>
            ))}
          </div>
        )}
        {result.nextCursor && (
          <Link
            className="inline-flex rounded-xl border border-border bg-card px-5 py-3 font-semibold text-primary"
            href={{
              pathname: base,
              query: {
                ...Object.fromEntries(query),
                cursor: result.nextCursor,
              },
            }}
          >
            Older jobs →
          </Link>
        )}
      </div>
    </main>
  );
}
