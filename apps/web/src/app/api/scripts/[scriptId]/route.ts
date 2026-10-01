import { hasOrganizationPermission } from "@aiwa/authz";
import { db, type Prisma } from "@aiwa/db";
import { scriptUpdateSchema } from "@aiwa/validation";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ scriptId: string }> },
) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  const { scriptId } = await params;

  const script = await db.script.findUnique({
    where: { id: scriptId },
    include: {
      project: true,
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  if (!script) {
    return NextResponse.json({ error: "Script not found." }, { status: 404 });
  }

  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: script.organizationId,
        userId: session.user.id,
      },
    },
    include: { organization: true },
  });
  if (!membership || membership.organization.status !== "ACTIVE") {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const content =
    (script.content as { scenes?: Array<{ audioJobId?: string }> }) || {};
  const jobIds = (content.scenes ?? [])
    .map((s) => s.audioJobId)
    .filter((id): id is string => typeof id === "string");

  const assets = jobIds.length
    ? await db.asset.findMany({
        where: {
          generationJobId: { in: jobIds },
          mediaKind: "AUDIO",
          status: "READY",
        },
        select: { id: true, generationJobId: true },
      })
    : [];

  const assetByJobId = new Map(assets.map((a) => [a.generationJobId, a.id]));

  const enrichedScenes = (content.scenes ?? []).map((s) => ({
    ...s,
    audioAssetId: s.audioJobId ? assetByJobId.get(s.audioJobId) : undefined,
  }));

  return NextResponse.json(
    {
      script: {
        ...script,
        content: {
          ...content,
          scenes: enrichedScenes,
        },
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ scriptId: string }> },
) {
  if (!hasTrustedMutationOrigin(request)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  const { scriptId } = await params;

  try {
    const existing = await db.script.findUnique({
      where: { id: scriptId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Script not found." }, { status: 404 });
    }

    const membership = await db.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: existing.organizationId,
          userId: session.user.id,
        },
      },
      include: { organization: true },
    });
    if (
      !membership ||
      membership.organization.status !== "ACTIVE" ||
      !hasOrganizationPermission(membership.role, "projects:write")
    ) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const json = await request.json();
    const input = scriptUpdateSchema.parse(json);

    if (input.projectId) {
      const project = await db.project.findFirst({
        where: {
          id: input.projectId,
          organizationId: existing.organizationId,
          archivedAt: null,
        },
        select: { id: true },
      });
      if (!project) {
        return NextResponse.json(
          { error: "Project is unavailable in this workspace." },
          { status: 400 },
        );
      }
    }

    const updated = await db.script.update({
      where: { id: scriptId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.logline !== undefined ? { logline: input.logline } : {}),
        ...(input.targetDurationSeconds !== undefined
          ? { targetDurationSeconds: input.targetDurationSeconds }
          : {}),
        ...(input.content !== undefined
          ? {
              content: input.content as unknown as Prisma.InputJsonValue,
            }
          : {}),
        ...(input.projectId !== undefined
          ? { projectId: input.projectId }
          : {}),
      },
    });

    return NextResponse.json({ script: updated });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid script update.", issues: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Failed to update script." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ scriptId: string }> },
) {
  if (!hasTrustedMutationOrigin(request)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  const { scriptId } = await params;

  const script = await db.script.findUnique({
    where: { id: scriptId },
  });
  if (!script) {
    return NextResponse.json({ error: "Script not found." }, { status: 404 });
  }

  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: script.organizationId,
        userId: session.user.id,
      },
    },
    include: { organization: true },
  });
  if (
    !membership ||
    membership.organization.status !== "ACTIVE" ||
    !hasOrganizationPermission(membership.role, "projects:write")
  ) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  await db.script.delete({
    where: { id: scriptId },
  });

  return NextResponse.json({ success: true });
}
