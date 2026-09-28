import { LocalAssetStorage } from "@aiwa/assets/storage";
import { parseServerEnv } from "@aiwa/config";
import { db } from "@aiwa/db";

import { getRequestSession } from "@/lib/request-auth";
import { requireAssetMembership } from "@/lib/asset-api";

export const runtime = "nodejs";
const env = parseServerEnv();

export async function GET(
  request: Request,
  context: { params: Promise<{ assetId: string; kind: string }> },
) {
  const session = await getRequestSession(request.headers);
  if (!session) return new Response(null, { status: 401 });
  const { assetId, kind } = await context.params;
  const normalizedKind = kind.toUpperCase();
  if (!["THUMBNAIL", "PREVIEW", "POSTER"].includes(normalizedKind))
    return new Response(null, { status: 404 });

  const asset = await db.asset.findUnique({
    where: { id: assetId },
    select: {
      organizationId: true,
      status: true,
      variants: {
        where: { kind: normalizedKind as "THUMBNAIL" | "PREVIEW" | "POSTER" },
        take: 1,
      },
    },
  });
  if (!asset || asset.status === "PURGED")
    return new Response(null, { status: 404 });
  const membership = await requireAssetMembership(
    session,
    asset.organizationId,
    false,
  );
  if (!membership) return new Response(null, { status: 404 });
  const variant = asset.variants[0];
  if (!variant) return new Response(null, { status: 404 });

  try {
    const storage = new LocalAssetStorage(env.ASSET_STORAGE_ROOT);
    const body = await storage.read(variant.objectKey);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": variant.mimeType,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `inline; filename="${assetId}-${kind}.jpg"`,
      },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
}
