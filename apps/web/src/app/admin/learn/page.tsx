import { db } from "@aiwa/db";
import { publishedContent } from "@aiwa/learn";
import Link from "next/link";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { requirePlatformPermission } from "@/lib/request-auth";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  await requirePlatformPermission("learn:manage");
  const query = await searchParams;
  const page = Math.max(1, Math.min(1000, Number(query.page) || 1));
  const posts = await db.learnPost.findMany({
    where: query.q ? { title: { contains: query.q.slice(0, 120) } } : {},
    orderBy: { updatedAt: "desc" },
    take: 30,
    skip: (page - 1) * 30,
    include: { _count: { select: { events: true } } },
  });
  const counts = await db.learnEvent.groupBy({
    by: ["postId", "kind"],
    where: { postId: { in: posts.map((p) => p.id) } },
    _count: { _all: true },
  });
  const count = (postId: string, kind: string) =>
    counts.find((c) => c.postId === postId && c.kind === kind)?._count._all ??
    0;
  const due = await db.learnPost.count({
    where: { publishedAt: { not: null }, reviewAt: { lte: new Date() } },
  });
  return (
    <div className="p-5 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Editorial workspace
          </p>
          <h1 className="font-display mt-3 text-4xl font-semibold">
            Learn publishing
          </h1>
          <p className="mt-3 text-muted-foreground">
            Write, review, publish, and keep your knowledge current.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/learn/new">Write an article</Link>
        </Button>
      </div>
      <div className="my-6 flex flex-wrap gap-5 rounded-2xl border border-border bg-card p-5">
        <Link href="/learn" className="text-primary">
          View public Learn ↗
        </Link>
        <p>{due} articles due for content review</p>
      </div>
      <form className="mb-5 flex gap-3">
        <input
          name="q"
          defaultValue={query.q}
          maxLength={120}
          aria-label="Find articles"
          className="form-control"
          placeholder="Find articles"
        />
        <Button variant="secondary">Search</Button>
      </form>
      <div className="space-y-3">
        {posts.map((p) => {
          const c = publishedContent(p.draft);
          return (
            <article
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-border bg-card p-5"
            >
              <div>
                <Link
                  href={`/admin/learn/${p.id}` as Route}
                  className="font-display text-xl font-semibold hover:text-primary"
                >
                  {c.title || "Untitled article"}
                </Link>
                <p className="mt-2 text-sm text-muted-foreground">
                  {p.status}{" "}
                  {p.publishedAt ? "· Live version available" : "· Not public"}{" "}
                  · {c.locale} · {p.updatedAt.toLocaleDateString("en-GB")}
                </p>
                {p.scheduledAt && (
                  <p className="mt-2 text-sm">
                    Scheduled {p.scheduledAt.toISOString()}
                  </p>
                )}
                {p.scheduleError && (
                  <p className="mt-2 text-sm text-destructive">
                    {p.scheduleError}
                  </p>
                )}
                {p.reviewAt && p.reviewAt <= new Date() && (
                  <p className="mt-2 text-sm text-warning">
                    Content review due
                  </p>
                )}
              </div>
              <div className="text-sm">
                <p>
                  {count(p.id, "TOOL_VISIT")} tool visits ·{" "}
                  {count(p.id, "SIGNUP")} signups ·{" "}
                  {count(p.id, "FIRST_GENERATION")} first creations
                </p>
                <Link
                  href={`/admin/learn/${p.id}` as Route}
                  className="mt-2 inline-block text-primary"
                >
                  Edit article →
                </Link>
              </div>
            </article>
          );
        })}
        {!posts.length && (
          <p className="rounded-2xl border border-dashed border-border p-10 text-muted-foreground">
            Your first article starts here. Choose “Write an article” to begin.
          </p>
        )}
      </div>
      <nav className="mt-8 flex gap-5">
        {page > 1 && (
          <Link
            href={
              `/admin/learn?page=${page - 1}&q=${encodeURIComponent(query.q ?? "")}` as Route
            }
          >
            Previous
          </Link>
        )}
        {posts.length === 30 && (
          <Link
            href={
              `/admin/learn?page=${page + 1}&q=${encodeURIComponent(query.q ?? "")}` as Route
            }
          >
            Next
          </Link>
        )}
      </nav>
    </div>
  );
}
