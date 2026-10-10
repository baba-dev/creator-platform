import { db } from "@aiwa/db";
import { publishedContent } from "@aiwa/learn";
import { cache } from "react";
export const getPost = cache(async (slug: string) =>
  db.learnPost.findFirst({ where: { slug, publishedAt: { not: null } } }),
);
export async function listPosts({
  q = "",
  topic = "",
  page = 1,
  locale = "",
}: { q?: string; topic?: string; page?: number; locale?: string } = {}) {
  const where = {
    publishedAt: { not: null },
    ...(topic ? { topic } : {}),
    ...(locale ? { locale } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q.slice(0, 120) } },
            { searchText: { contains: q.slice(0, 120) } },
          ],
        }
      : {}),
  };
  const [posts, total] = await Promise.all([
    db.learnPost.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        topic: true,
        published: true,
        publishedAt: true,
      },
      take: 12,
      skip: (Math.min(Math.max(page, 1), 1000) - 1) * 12,
    }),
    db.learnPost.count({ where }),
  ]);
  return {
    posts: posts.map((p) => ({ ...p, content: publishedContent(p.published) })),
    total,
  };
}
export const learnOrigin = () =>
  new URL(process.env.APP_URL ?? "https://creator.aiwamediagroup.com").origin;
