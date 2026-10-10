import type { MetadataRoute } from "next";
import { db } from "@aiwa/db";
import { publishedContent } from "@aiwa/learn";
import { learnOrigin } from "@/lib/learn/queries";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = learnOrigin();
  const posts = await db.learnPost.findMany({
    where: { publishedAt: { not: null } },
    take: 45000,
    select: { slug: true, published: true, modifiedAt: true },
  });
  return [
    { url: origin },
    { url: `${origin}/learn` },
    ...posts
      .filter((p) => !publishedContent(p.published).noindex)
      .map((p) => ({
        url: `${origin}/learn/${p.slug}`,
        lastModified: p.modifiedAt ?? undefined,
      })),
  ];
}
