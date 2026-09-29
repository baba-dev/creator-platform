import { videoEditDocumentSchema } from "@aiwa/assets/video-edit";
import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAssetMembership } from "@/lib/asset-api";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import { validateVideoSources } from "@/lib/video-edits";

const create = z
  .object({
    organizationId: z.string().min(1).max(100),
    projectId: z.string().min(1).max(100).nullable().optional(),
    title: z.string().trim().min(1).max(191),
    document: videoEditDocumentSchema,
  })
  .strict();

export async function GET(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const organizationId =
    new URL(request.url).searchParams.get("organizationId") ?? "";
  if (!(await requireAssetMembership(session, organizationId)))
    return NextResponse.json(
      { error: "Workspace access denied." },
      { status: 403 },
    );
  const edits = await db.videoEdit.findMany({
    where: { organizationId, createdById: session.user.id },
    orderBy: { updatedAt: "desc" },
    take: 40,
    select: { id: true, title: true, revision: true, updatedAt: true },
  });
  return NextResponse.json(
    { edits },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const text = await request.text();
  if (text.length > 40_000)
    return NextResponse.json({ error: "Edit too large." }, { status: 413 });
  let input: z.infer<typeof create>;
  try {
    input = create.parse(JSON.parse(text));
  } catch {
    return NextResponse.json({ error: "Invalid video edit." }, { status: 400 });
  }
  if (!(await requireAssetMembership(session, input.organizationId, true)))
    return NextResponse.json(
      { error: "Workspace access denied." },
      { status: 403 },
    );
  try {
    await validateVideoSources(
      input.organizationId,
      session.user.id,
      input.document,
    );
    if (
      input.projectId &&
      !(await db.project.findFirst({
        where: {
          id: input.projectId,
          organizationId: input.organizationId,
          archivedAt: null,
        },
      }))
    )
      throw new Error("Project is unavailable.");
    const edit = await db.videoEdit.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        createdById: session.user.id,
        title: input.title,
        document: input.document,
      },
      select: { id: true, revision: true },
    });
    return NextResponse.json({ edit }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Edit unavailable." },
      { status: 400 },
    );
  }
}
