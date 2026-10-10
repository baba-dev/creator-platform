import { db } from "@aiwa/db";
import { publishedContent, learnTools, attributeLearn } from "@aiwa/learn";
import { notFound, redirect } from "next/navigation";
import { getRequestSession } from "@/lib/request-auth";
import Link from "next/link";
import type { Route } from "next";
import { ArticleActions } from "@/components/learn/article-actions";
export const metadata = { robots: { index: false, follow: false } };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const post = await db.learnPost.findFirst({
    where: { id, publishedAt: { not: null } },
  });
  if (!post) notFound();
  const c = publishedContent(post.published);
  if (!c.tool) redirect(`/learn/${post.slug}`);
  const session = await getRequestSession();
  const returnTo = `/learn/start/${id}`;
  if (!session)
    return (
      <main className="mx-auto max-w-2xl px-5 py-20">
        <h1 className="font-display text-4xl font-semibold">
          Put your idea into motion.
        </h1>
        <p className="mt-5 text-lg text-muted-foreground">
          Sign in or create an account to continue to {learnTools[c.tool]}.
        </p>
        <div className="mt-8 flex flex-wrap gap-5">
          <Link
            href={`/sign-up?returnTo=${encodeURIComponent(returnTo)}` as Route}
            className="rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground"
          >
            Create an account
          </Link>
          <Link
            href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}` as Route}
            className="rounded-xl border border-border px-6 py-3"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  const membership = await db.membership.findFirst({
    where: { userId: session.user.id, organization: { status: "ACTIVE" } },
    select: { organization: { select: { slug: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!membership)
    redirect(`/onboarding?returnTo=${encodeURIComponent(returnTo)}`);
  await attributeLearn(session.user.id, id).catch(() => undefined);
  const destination = `/app/${membership.organization.slug}${c.tool === "dashboard" ? "" : `/${c.tool}`}${c.prompt && ["image", "video", "speech"].includes(c.tool) ? `?learn=${id}` : ""}`;
  return (
    <main className="mx-auto max-w-2xl px-5 py-20">
      <p className="text-sm font-semibold text-primary">
        From Learn to your workspace
      </p>
      <h1 className="font-display mt-4 text-4xl font-semibold">
        Make it your own.
      </h1>
      <p className="mt-5 text-lg text-muted-foreground">{c.title}</p>
      <ArticleActions prompt={c.prompt} />
      <Link
        href={destination as Route}
        className="mt-8 inline-flex rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground"
      >
        Open {learnTools[c.tool]} ↗
      </Link>
      <p className="mt-4 text-sm text-muted-foreground">
        Choose your model and settings in the studio. Nothing is generated or
        charged until you submit.
      </p>
    </main>
  );
}
