import { listPosts, learnOrigin } from "@/lib/learn/queries";
const xml = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export async function GET() {
  const { posts } = await listPosts();
  const origin = learnOrigin();
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Aiwa Creators Learn</title><link>${xml(origin)}/learn</link><description>Guides, ideas and answers</description>${posts
      .filter((p) => !p.content.noindex)
      .map(
        (p) =>
          `<item><title>${xml(p.title)}</title><link>${xml(origin)}/learn/${p.slug}</link><guid>${xml(origin)}/learn/${p.slug}</guid><description>${xml(p.excerpt)}</description><pubDate>${p.publishedAt!.toUTCString()}</pubDate></item>`,
      )
      .join("")}</channel></rss>`,
    { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } },
  );
}
