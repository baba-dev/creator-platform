import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { learnAdmin } from "@/lib/learn/auth";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await learnAdmin(request)))
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const { id } = await params;
  const post = await db.learnPost.findUnique({
    where: { id },
    include: { revisions: { orderBy: { createdAt: "desc" }, take: 30 } },
  });
  return post
    ? NextResponse.json(post, {
        headers: { "Cache-Control": "private, no-store" },
      })
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}
