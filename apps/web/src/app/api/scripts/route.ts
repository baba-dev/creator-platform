import { db, type Prisma } from "@aiwa/db";
import { scriptCreateSchema } from "@aiwa/validation";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

export async function GET(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  if (!organizationId) {
    return NextResponse.json(
      { error: "organizationId is required." },
      { status: 400 },
    );
  }

  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId: session.user.id,
      },
    },
    include: { organization: true },
  });
  if (!membership || membership.organization.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "Workspace access denied." },
      { status: 403 },
    );
  }

  const scripts = await db.script.findMany({
    where: { organizationId },
    include: {
      project: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(
    { scripts },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
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

  try {
    const json = await request.json();
    const input = scriptCreateSchema.parse(json);

    const membership = await db.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: input.organizationId,
          userId: session.user.id,
        },
      },
      include: { organization: true },
    });
    if (!membership || membership.organization.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Workspace access denied." },
        { status: 403 },
      );
    }

    const script = await db.script.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        title: input.title,
        description: input.description ?? null,
        logline: input.logline ?? null,
        targetDurationSeconds: input.targetDurationSeconds ?? null,
        content: input.content as unknown as Prisma.InputJsonValue,
        createdById: session.user.id,
      },
    });

    return NextResponse.json({ script }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid script data.", issues: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Failed to create script." },
      { status: 500 },
    );
  }
}
