/* eslint-disable @next/next/no-img-element -- public editorial images are already bounded WebP derivatives */
import Link from "next/link";
import type { Route } from "next";
import { learnTopics, mediaUrl } from "@aiwa/learn/content";
import { listPosts } from "@/lib/learn/queries";
import { Eyebrow, CreativeSurface } from "@/components/ui/creative";
export async function LearnArchive({
  q = "",
  topic = "",
  page = 1,
  locale = "",
}: {
  q?: string;
  topic?: string;
  page?: number;
  locale?: string;
}) {
  const { posts, total } = await listPosts({ q, topic, page, locale });
  const featured =
    !q && !topic && page === 1
      ? (posts.find((p) => p.content.featured) ?? posts[0])
      : undefined;
  return (
    <main className="mx-auto max-w-7xl px-5 py-12 sm:px-7 sm:py-20">
      <div className="grid gap-8 lg:grid-cols-[1fr_.65fr] lg:items-end">
        <div>
          <Eyebrow>The Aiwa Creators field notes</Eyebrow>
          <h1 className="font-display mt-5 text-5xl font-semibold tracking-tight sm:text-7xl">
            A good idea.
            <br />
            <span className="sketch-underline">Now make it.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
            Practical guides, creative possibilities, and the little details
            that make your next project better.
          </p>
        </div>
        <form action="/learn" className="space-y-3">
          <label htmlFor="learn-search" className="text-sm font-semibold">
            What would you like to create?
          </label>
          <div className="flex gap-2">
            <input
              id="learn-search"
              name="q"
              defaultValue={q}
              maxLength={120}
              placeholder="Search guides and answers"
              className="form-control min-w-0"
            />
            <button className="rounded-xl bg-primary px-5 font-semibold text-primary-foreground">
              Search
            </button>
          </div>
          <label className="flex items-center gap-3 text-sm text-muted-foreground">
            Language
            <input
              name="locale"
              defaultValue={locale}
              placeholder="All (or en, ar…)"
              pattern="[a-z]{2}(-[A-Z]{2})?"
              maxLength={5}
              className="form-control max-w-44"
            />
          </label>
        </form>
      </div>
      <nav aria-label="Article topics" className="my-10 flex flex-wrap gap-2">
        <Link
          href="/learn"
          className={`rounded-full border px-4 py-2 text-sm ${!topic ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
        >
          All stories
        </Link>
        {learnTopics.map((t) => (
          <Link
            key={t}
            href={`/learn/topics/${t}` as Route}
            className={`rounded-full border px-4 py-2 text-sm capitalize ${topic === t ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
          >
            {t.replaceAll("-", " ")}
          </Link>
        ))}
      </nav>
      {featured && (
        <Link href={`/learn/${featured.slug}` as Route} className="group block">
          <CreativeSurface
            variant="sketch"
            className="grid overflow-hidden rounded-[28px] lg:grid-cols-[1.2fr_1fr]"
          >
            <img
              src={mediaUrl(featured.content.coverId)}
              alt={featured.content.coverAlt}
              width={1200}
              height={675}
              fetchPriority="high"
              className="aspect-video h-full w-full object-cover"
              style={{
                objectPosition: `${featured.content.focalX}% ${featured.content.focalY}%`,
              }}
            />
            <div className="flex flex-col justify-center p-7 sm:p-10">
              <Eyebrow>Editor’s pick · {featured.content.type}</Eyebrow>
              <h2 className="font-display mt-5 text-3xl font-semibold tracking-tight sm:text-4xl group-hover:text-primary">
                {featured.title}
              </h2>
              <p className="mt-5 leading-7 text-muted-foreground">
                {featured.excerpt}
              </p>
              <span className="mt-8 text-sm font-semibold text-primary">
                Read the story ↗
              </span>
            </div>
          </CreativeSurface>
        </Link>
      )}
      <div className="mb-6 mt-14 flex items-center justify-between">
        <h2 className="font-display text-2xl font-semibold">
          {q
            ? `Results for “${q}”`
            : topic
              ? topic.replaceAll("-", " ")
              : "Fresh perspectives"}
        </h2>
        <span className="text-sm text-muted-foreground">{total} articles</span>
      </div>
      <div className="grid gap-x-6 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
        {posts
          .filter((p) => p.id !== featured?.id)
          .map((p) => (
            <article key={p.id}>
              <Link href={`/learn/${p.slug}` as Route} className="group block">
                <img
                  src={mediaUrl(p.content.coverId)}
                  alt={p.content.coverAlt}
                  width={720}
                  height={405}
                  loading="lazy"
                  className="aspect-video w-full rounded-2xl object-cover"
                  style={{
                    objectPosition: `${p.content.focalX}% ${p.content.focalY}%`,
                  }}
                />
                <p className="mt-5 text-xs font-bold uppercase tracking-widest text-primary">
                  {p.content.type} · {p.topic.replaceAll("-", " ")}
                </p>
                <h3 className="font-display mt-3 text-2xl font-semibold tracking-tight group-hover:text-primary">
                  {p.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {p.excerpt}
                </p>
                <p className="mt-4 text-xs text-muted-foreground">
                  {p.content.author} ·{" "}
                  {p.publishedAt?.toLocaleDateString("en-GB", {
                    dateStyle: "medium",
                  })}
                </p>
              </Link>
            </article>
          ))}
      </div>
      {!posts.length && (
        <div className="rounded-3xl border border-border bg-card p-10">
          <h2 className="font-display text-2xl">
            {q ? "Try another search" : "Good things are taking shape."}
          </h2>
          <p className="mt-3 text-muted-foreground">
            {q
              ? "Try a topic such as images, voice, or storage."
              : "Our first guides are on their way. Explore the studio while we put the finishing touches on them."}
          </p>
          <Link
            href="/app"
            className="mt-6 inline-block font-semibold text-primary"
          >
            Explore Aiwa Creators ↗
          </Link>
        </div>
      )}
      <nav aria-label="Pagination" className="mt-12 flex gap-6">
        {page > 1 && (
          <Link
            href={
              `/learn?${new URLSearchParams({ q, topic, locale, page: String(page - 1) })}` as Route
            }
          >
            ← Previous
          </Link>
        )}
        {page * 12 < total && (
          <Link
            href={
              `/learn?${new URLSearchParams({ q, topic, locale, page: String(page + 1) })}` as Route
            }
          >
            Next →
          </Link>
        )}
      </nav>
    </main>
  );
}
