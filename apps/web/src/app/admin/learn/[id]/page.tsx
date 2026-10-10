import { db } from "@aiwa/db";
import { publishedContent } from "@aiwa/learn";
import { notFound } from "next/navigation";
import { LearnEditor } from "@/components/learn/editor";
import { requirePlatformPermission } from "@/lib/request-auth";
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
    <LearnEditor
      id={id}
      version={post.version}
      initial={publishedContent(post.draft)}
      reviewDate={post.reviewAt?.toISOString().slice(0, 10)}
    />
  );
}
