import { db } from "@aiwa/db";
import { requireMembership } from "@aiwa/generation";
import { readStoredImage } from "@aiwa/generation/storage";
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
    const bytes = await readStoredImage(asset.objectKey);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `${new URL(request.url).searchParams.has("download") ? "attachment" : "inline"}; filename="${asset.id}.png"`,
      },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
}
