import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { requireAssetMembership } from "@/lib/asset-api";
import { loadAssetPreviewStatuses } from "@/lib/asset-preview-status";
const schema = z.object({
  organizationId: z.string().min(1).max(100),
  ids: z
    .array(z.string().regex(/^[A-Za-z0-9_-]{1,100}$/))
    .min(1)
    .max(100),
});
export async function GET(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const url = new URL(request.url);
  const parsed = schema.safeParse({
    organizationId: url.searchParams.get("organizationId"),
    ids: url.searchParams.getAll("id"),
  });
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid preview query." },
      { status: 400 },
    );
  if (!(await requireAssetMembership(session, parsed.data.organizationId)))
    return NextResponse.json(
      { error: "Workspace access denied." },
      { status: 403 },
    );
  const assets = await db.asset.findMany({
    where: {
      id: { in: parsed.data.ids },
      organizationId: parsed.data.organizationId,
      status: "READY",
      OR: [
        { purpose: "GENERAL" },
        { purpose: "REFERENCE_INPUT", storageOwnerUserId: session.user.id },
      ],
    },
    select: {
      id: true,
      mediaKind: true,
      status: true,
      storageProvider: true,
      variants: { select: { id: true, kind: true, mimeType: true } },
    },
    take: 100,
  });
  const previews = await loadAssetPreviewStatuses(
    parsed.data.organizationId,
    assets,
  );
  return NextResponse.json(
    {
      assets: assets.map((asset) => ({
        id: asset.id,
        previews: previews.get(asset.id),
        variants: asset.variants,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
