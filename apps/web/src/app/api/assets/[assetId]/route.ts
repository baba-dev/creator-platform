import { db } from "@aiwa/db";
import { requireMembership } from "@aiwa/generation";
import {
  readStoredAsset,
  readStoredAssetRange,
  storedAssetSize,
} from "@aiwa/generation/storage";
import { getRequestSession } from "@/lib/request-auth";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const session = await getRequestSession(request.headers);
  if (!session) return new Response(null, { status: 401 });
  const { assetId } = await params;
  const asset = await db.asset.findFirst({
    where: { id: assetId, status: "READY" },
  });
  if (!asset) return new Response(null, { status: 404 });
  try {
    await requireMembership(db, asset.organizationId, session.user.id);
  } catch {
    return new Response(null, { status: 404 });
  }
  try {
    const isVideo = asset.mimeType.startsWith("video/");
    const isAudio = asset.mimeType.startsWith("audio/");
    const isMedia = isVideo || isAudio;
    const ext = isVideo ? "mp4" : isAudio ? "mp3" : "png";
    const download = new URL(request.url).searchParams.has("download");
    const range = !download && isMedia ? request.headers.get("range") : null;
    let body: Buffer;
    let status = 200;
    const headers = new Headers({
      "Content-Type": asset.mimeType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${asset.id}.${ext}"`,
    });

    if (isMedia) headers.set("Accept-Ranges", "bytes");
    if (range) {
      const byteSize = await storedAssetSize(asset.objectKey);
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (!match) {
        headers.set("Content-Range", `bytes */${byteSize}`);
        return new Response(null, { status: 416, headers });
      }
      const isSuffixRange = !match[1];
      const requestedStart = match[1] ? Number(match[1]) : 0;
      const requestedEnd = match[2] ? Number(match[2]) : byteSize - 1;
      const start = isSuffixRange
        ? Math.max(0, byteSize - requestedEnd)
        : requestedStart;
      const end = isSuffixRange
        ? byteSize - 1
        : Math.min(requestedEnd, byteSize - 1);
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        (isSuffixRange && requestedEnd <= 0) ||
        start > end ||
        start >= byteSize
      ) {
        headers.set("Content-Range", `bytes */${byteSize}`);
        return new Response(null, { status: 416, headers });
      }
      body = await readStoredAssetRange(asset.objectKey, start, end);
      status = 206;
      headers.set("Content-Range", `bytes ${start}-${end}/${byteSize}`);
    } else body = await readStoredAsset(asset.objectKey);

    headers.set("Content-Length", String(body.length));
    return new Response(new Uint8Array(body), {
      status,
      headers,
    });
  } catch {
    return new Response(null, { status: 503 });
  }
}
