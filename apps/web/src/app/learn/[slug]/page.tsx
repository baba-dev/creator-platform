import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { db } from "@aiwa/db";
import { mediaUrl, publishedContent } from "@aiwa/learn";
import { LearnArticle } from "@/components/learn/article";
import { getPost, learnOrigin, listPosts } from "@/lib/learn/queries";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = await getPost(slug);
  if (!p) return { robots: { index: false, follow: false } };
  const c = publishedContent(p.published);
  const translated = await db.learnPost.findMany({
    where: { translationKey: c.translationKey, publishedAt: { not: null } },
    select: { locale: true, slug: true },
  });
  return {
    title: c.seoTitle || c.title,
    description: c.description || c.excerpt,
    alternates: {
      canonical: `/learn/${p.slug}`,
      languages: Object.fromEntries(
        translated.map((t) => [t.locale, `/learn/${t.slug}`]),
      ),
    },
    robots: { index: !c.noindex, follow: true, "max-image-preview": "large" },
    openGraph: {
      type: "article",
      title: c.seoTitle || c.title,
      description: c.description || c.excerpt,
      url: `/learn/${p.slug}`,
      publishedTime: p.publishedAt?.toISOString(),
      modifiedTime: p.modifiedAt?.toISOString(),
      authors: [c.author],
      images: [
        { url: mediaUrl(c.socialImageId || c.coverId), alt: c.coverAlt },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: c.seoTitle || c.title,
      description: c.description || c.excerpt,
      images: [mediaUrl(c.socialImageId || c.coverId)],
    },
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const p = await getPost(slug);
  if (!p) {
    const moved = await db.learnRedirect.findUnique({
      where: { slug },
      include: { post: { select: { slug: true, publishedAt: true } } },
    });
    if (moved?.post.publishedAt) permanentRedirect(`/learn/${moved.post.slug}`);
    notFound();
  }
  const c = publishedContent(p.published);
  const origin = learnOrigin();
  const { posts } = await listPosts({ topic: c.topic, locale: c.locale });
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        headline: c.title,
        description: c.excerpt,
        image: `${origin}${mediaUrl(c.coverId)}`,
        datePublished: p.publishedAt?.toISOString(),
        dateModified: p.modifiedAt?.toISOString(),
        author: { "@type": "Person", name: c.author },
        publisher: { "@type": "Organization", name: "Aiwa Creators" },
        mainEntityOfPage: `${origin}/learn/${p.slug}`,
        inLanguage: c.locale,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Learn",
            item: `${origin}/learn`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: c.topic,
            item: `${origin}/learn/topics/${c.topic}`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: c.title,
            item: `${origin}/learn/${p.slug}`,
          },
        ],
      },
    ],
  };
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(data).replace(/</g, "\\u003c"),
        }}
      />
      <LearnArticle
        id={p.id}
        content={c}
        publishedAt={p.publishedAt}
        modifiedAt={p.modifiedAt}
      />
      <section className="mx-auto max-w-5xl px-5 py-8">
        <h2 className="font-display text-3xl font-semibold">Keep exploring</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {posts
            .filter((x) => x.id !== p.id)
            .slice(0, 3)
            .map((x) => (
              <Link
                href={`/learn/${x.slug}` as Route}
                key={x.id}
                className="rounded-2xl border border-border bg-card p-6"
              >
                <p className="text-xs text-primary">{x.content.type}</p>
                <h3 className="font-display mt-3 text-xl font-semibold">
                  {x.title}
                </h3>
                <p className="mt-3 text-sm text-muted-foreground">
                  {x.excerpt}
                </p>
              </Link>
            ))}
        </div>
      </section>
    </main>
  );
}
