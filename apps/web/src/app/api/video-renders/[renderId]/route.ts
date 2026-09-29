import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { requireAssetMembership } from "@/lib/asset-api";
import { getRequestSession } from "@/lib/request-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ renderId: string }> },
) {
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const organizationId =
    new URL(request.url).searchParams.get("organizationId") ?? "";
  if (!(await requireAssetMembership(session, organizationId)))
    return NextResponse.json({ error: "Render unavailable." }, { status: 404 });
  const { renderId } = await params;
  const render = await db.videoRender.findFirst({
    where: { id: renderId, organizationId, createdById: session.user.id },
    select: { id: true, status: true, outputAssetId: true, errorMessage: true },
  });
  return render
    ? NextResponse.json(render, {
        headers: { "Cache-Control": "private, no-store" },
      })
    : NextResponse.json({ error: "Render unavailable." }, { status: 404 });
}
