import { videoEditDocumentSchema } from "@aiwa/assets/video-edit";
import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAssetMembership } from "@/lib/asset-api";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import { validateVideoSources } from "@/lib/video-edits";

type Context = { params: Promise<{ editId: string }> };
const update = z
  .object({
    organizationId: z.string().min(1).max(100),
    revision: z.number().int().positive(),
    title: z.string().trim().min(1).max(191),
    document: videoEditDocumentSchema,
  })
  .strict();

export async function GET(request: Request, context: Context) {
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
  const { editId } = await context.params;
  const edit = await db.videoEdit.findFirst({
    where: { id: editId, organizationId, createdById: session.user.id },
  });
  return edit
    ? NextResponse.json(
        { edit },
        { headers: { "Cache-Control": "private, no-store" } },
      )
    : NextResponse.json({ error: "Edit unavailable." }, { status: 404 });
}

export async function PATCH(request: Request, context: Context) {
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
  let input: z.infer<typeof update>;
  try {
    input = update.parse(JSON.parse(text));
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
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Source unavailable." },
      { status: 400 },
    );
  }
  const { editId } = await context.params;
  const changed = await db.videoEdit.updateMany({
    where: {
      id: editId,
      organizationId: input.organizationId,
      createdById: session.user.id,
      revision: input.revision,
    },
    data: {
      title: input.title,
      document: input.document,
      revision: { increment: 1 },
    },
  });
  if (!changed.count)
    return NextResponse.json(
      { error: "Edit changed in another tab. Reload before saving." },
      { status: 409 },
    );
  return NextResponse.json({ revision: input.revision + 1 });
}
