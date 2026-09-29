import { formatVideoCaptions } from "@aiwa/assets/video-captions";
import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { requireAssetMembership } from "@/lib/asset-api";
import { getRequestSession } from "@/lib/request-auth";

type Context = { params: Promise<{ editId: string }> };

export async function GET(request: Request, context: Context) {
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId") ?? "";
  const format = url.searchParams.get("format");
  if (format !== "srt" && format !== "vtt")
    return NextResponse.json({ error: "Choose SRT or VTT." }, { status: 400 });
  if (!(await requireAssetMembership(session, organizationId)))
    return NextResponse.json(
      { error: "Workspace access denied." },
      { status: 403 },
    );
  const { editId } = await context.params;
  const edit = await db.videoEdit.findFirst({
    where: { id: editId, organizationId, createdById: session.user.id },
    select: { document: true },
  });
  if (!edit)
    return NextResponse.json({ error: "Edit unavailable." }, { status: 404 });
  try {
    const captions = formatVideoCaptions(edit.document, format);
    return new Response(captions, {
      headers: {
        "Content-Type":
          format === "vtt"
            ? "text/vtt; charset=utf-8"
            : "application/x-subrip; charset=utf-8",
        "Content-Disposition": `attachment; filename="captions.${format}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Saved captions are invalid." },
      { status: 422 },
    );
  }
}
