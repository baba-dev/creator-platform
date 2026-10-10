/* eslint-disable @next/next/no-img-element -- editorial images are optimized at ingestion */
import Link from "next/link";
import type { Route } from "next";
import {
  articleHtml,
  mediaUrl,
  plainText,
  type LearnContent,
} from "@aiwa/learn";
import { Eyebrow } from "@/components/ui/creative";
import { ArticleActions } from "./article-actions";
export function LearnArticle({
  content: c,
  id,
  publishedAt,
  modifiedAt,
  preview = false,
}: {
  content: LearnContent;
  id: string;
  publishedAt: Date | null;
  modifiedAt: Date | null;
  preview?: boolean;
}) {
  const { html, headings } = articleHtml(c.html);
  return (
    <article
      lang={c.locale}
      dir={c.locale.startsWith("ar") ? "rtl" : undefined}
      className="mx-auto max-w-7xl px-5 py-12 sm:px-7 sm:py-16"
    >
      {preview && (
        <p className="mb-8 rounded-xl bg-warning/10 p-4 font-semibold text-warning">
          Private preview — these changes are not published.
        </p>
      )}
      <nav
        aria-label="Breadcrumb"
        className="mb-8 flex gap-3 text-sm text-muted-foreground"
      >
        <Link href="/learn">Learn</Link>
        <span>/</span>
        <Link href={`/learn/topics/${c.topic}` as Route} className="capitalize">
          {c.topic.replaceAll("-", " ")}
        </Link>
      </nav>
      <header className="mx-auto max-w-4xl text-center">
        <Eyebrow>{c.type}</Eyebrow>
        <h1 className="font-display mt-5 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
          {c.title || "Your article title"}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
          {c.excerpt}
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{c.author}</span>
          <span>
            {Math.max(
              1,
              Math.ceil(plainText(c.html).split(/\s+/).length / 220),
            )}{" "}
            min read
          </span>
          {publishedAt && (
            <time dateTime={publishedAt.toISOString()}>
              {publishedAt.toLocaleDateString("en-GB", { dateStyle: "medium" })}
            </time>
          )}
          {modifiedAt &&
            publishedAt &&
            modifiedAt.getTime() - publishedAt.getTime() > 60000 && (
              <time dateTime={modifiedAt.toISOString()}>
                Updated{" "}
                {modifiedAt.toLocaleDateString("en-GB", {
                  dateStyle: "medium",
                })}
              </time>
            )}
        </div>
      </header>
      {c.coverId && (
        <img
          src={mediaUrl(c.coverId)}
          alt={c.coverAlt}
          width={1600}
          height={900}
          fetchPriority="high"
          className="my-12 aspect-video w-full rounded-[28px] object-cover"
          style={{ objectPosition: `${c.focalX}% ${c.focalY}%` }}
        />
      )}
      <div className="mt-12 grid gap-12 lg:grid-cols-[200px_minmax(0,740px)] lg:justify-center">
        <aside>
          <details
            open
            className="rounded-2xl border border-border p-5 lg:sticky lg:top-8"
          >
            <summary className="cursor-pointer text-sm font-semibold">
              On this page
            </summary>
            <nav aria-label="Table of contents" className="mt-4 space-y-3">
              {headings.map((h) => (
                <a
                  key={h.id}
                  href={`#${h.id}`}
                  className="block text-sm leading-6 text-muted-foreground hover:text-primary"
                >
                  {h.text}
                </a>
              ))}
            </nav>
          </details>
        </aside>
        <div className="min-w-0">
          <div
            className="learn-prose"
            dangerouslySetInnerHTML={{ __html: html }}
          />
          <ArticleActions prompt={c.prompt} />
          {c.tool && !preview && (
            <div className="my-12 rounded-3xl border border-primary/20 bg-primary/5 p-7">
              <Eyebrow>From reading to creating</Eyebrow>
              <h2 className="font-display mt-3 text-3xl font-semibold">
                Your next idea starts here.
              </h2>
              <p className="mt-3 text-muted-foreground">
                Open the workspace, explore your options, and create when you’re
                ready.
              </p>
              <Link
                href={`/learn/start/${id}` as Route}
                className="mt-6 inline-flex rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground"
              >
                {c.ctaLabel} ↗
              </Link>
            </div>
          )}
          <div className="mt-12 border-t border-border pt-7">
            <p className="font-semibold">Written by {c.author}</p>
            {c.authorBio && (
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                {c.authorBio}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {c.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-muted px-3 py-1 text-xs"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
