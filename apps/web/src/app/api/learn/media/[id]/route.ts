import { db } from "@aiwa/db";
import { LocalAssetStorage } from "@aiwa/assets/storage";
import { parseServerEnv } from "@aiwa/config";
import { mediaIds, publishedContent } from "@aiwa/learn";
import { learnAdmin } from "@/lib/learn/auth";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const media = await db.learnMedia.findUnique({
    where: { id },
    include: {
      asset: true,
      posts: {
        where: { post: { publishedAt: { not: null } } },
        select: { post: { select: { published: true } } },
        take: 100,
      },
    },
  });
  if (
    !media ||
    media.asset.status !== "READY" ||
    media.asset.storageProvider !== "LOCAL"
  )
    return new Response(null, { status: 404 });
  const visible = media.posts.some((p) =>
    mediaIds(publishedContent(p.post.published)).includes(id),
  );
  if (!visible && !(await learnAdmin(request)))
    return new Response(null, { status: 404 });
  const storage = new LocalAssetStorage(parseServerEnv().ASSET_STORAGE_ROOT);
  const size = Number(media.asset.byteSize);
  const headers = {
    "Content-Type": media.asset.mimeType,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
  };
  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    const start = Number(match?.[1]);
    const end = match?.[2]
      ? Math.min(Number(match[2]), size - 1)
      : Math.min(start + 1048575, size - 1);
    if (
      !match ||
      !Number.isSafeInteger(start) ||
      start < 0 ||
      start >= size ||
      end < start
    )
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    const bytes = await storage.readRange(media.asset.objectKey, start, end);
    return new Response(new Uint8Array(bytes), {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(bytes.length),
      },
    });
  }
  const bytes = await storage.read(media.asset.objectKey);
  return new Response(new Uint8Array(bytes), {
    headers: { ...headers, "Content-Length": String(bytes.length) },
  });
}
