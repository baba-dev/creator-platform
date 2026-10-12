import type { MetadataRoute } from "next";
import { db } from "@aiwa/db";
import { publishedContent } from "@aiwa/learn";
import { learnOrigin } from "@/lib/learn/queries";
import { publicTools } from "@/lib/public-tools";
import { solutions } from "@/lib/public-solutions";
import { getPublicPricingCatalogue } from "@/lib/public-pricing";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = learnOrigin();
  const [posts, pricing] = await Promise.all([
    db.learnPost.findMany({
      where: { publishedAt: { not: null } },
      take: 45000,
      select: { slug: true, published: true, modifiedAt: true },
    }),
    getPublicPricingCatalogue().catch(() => ({ models: [] })),
  ]);
  const operations = pricing.models.filter(
    (item) => item.kind === "tool" && item.category === "tools",
  );
  return [
    { url: origin },
    { url: `${origin}/pricing` },
    { url: `${origin}/tools` },
    { url: `${origin}/solutions` },
    ...solutions.map((solution) => ({
      url: origin + "/solutions/" + solution.slug,
    })),
    ...publicTools.map((tool) => ({ url: `${origin}/tools/${tool.slug}` })),
    ...operations.map((item) => ({
      url: `${origin}/tools/operations/${encodeURIComponent(item.id)}`,
    })),
    { url: `${origin}/learn` },
    ...posts
      .filter((p) => !publishedContent(p.published).noindex)
      .map((p) => ({
        url: `${origin}/learn/${p.slug}`,
        lastModified: p.modifiedAt ?? undefined,
      })),
  ];
}
