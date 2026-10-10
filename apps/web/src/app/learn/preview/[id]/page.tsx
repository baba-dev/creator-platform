import { db } from "@aiwa/db";
import { publishedContent } from "@aiwa/learn";
import { notFound } from "next/navigation";
import { requirePlatformPermission } from "@/lib/request-auth";
import { LearnArticle } from "@/components/learn/article";
export const metadata = {
  title: "Private article preview",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformPermission("learn:manage");
  const { id } = await params;
  const post = await db.learnPost.findUnique({ where: { id } });
  if (!post) notFound();
  return (
    <main>
      <LearnArticle
        id={id}
        content={publishedContent(post.draft)}
        publishedAt={post.publishedAt}
        modifiedAt={post.modifiedAt}
        preview
      />
    </main>
  );
}
