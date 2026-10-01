import { db, type Prisma } from "@aiwa/db";
import { storyPlanUpdateSchema } from "@aiwa/validation";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  const { planId } = await params;

  const storyPlan = await db.storyPlan.findUnique({
    where: { id: planId },
    include: {
      project: true,
      createdBy: { select: { id: true, name: true } },
    },
  });

  if (!storyPlan) {
    return NextResponse.json(
      { error: "Story plan not found." },
      { status: 404 },
    );
  }

  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: storyPlan.organizationId,
        userId: session.user.id,
      },
    },
  });
  if (!membership) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  return NextResponse.json(
    { storyPlan },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ planId: string }> },
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
  const { planId } = await params;

  try {
    const existing = await db.storyPlan.findUnique({
      where: { id: planId },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Story plan not found." },
        { status: 404 },
      );
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
    if (!membership || membership.organization.status !== "ACTIVE") {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const json = await request.json();
    const input = storyPlanUpdateSchema.parse(json);

    const updated = await db.storyPlan.update({
      where: { id: planId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.genre !== undefined ? { genre: input.genre } : {}),
        ...(input.premise !== undefined ? { premise: input.premise } : {}),
        ...(input.structureType !== undefined
          ? { structureType: input.structureType }
          : {}),
        ...(input.beats !== undefined
          ? {
              beats: input.beats as unknown as Prisma.InputJsonValue,
            }
          : {}),
        ...(input.characters !== undefined
          ? {
              characters: input.characters as unknown as Prisma.InputJsonValue,
            }
          : {}),
        ...(input.projectId !== undefined
          ? { projectId: input.projectId }
          : {}),
      },
    });

    return NextResponse.json({ storyPlan: updated });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid story plan update.", issues: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Failed to update story plan." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ planId: string }> },
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
  const { planId } = await params;

  const storyPlan = await db.storyPlan.findUnique({
    where: { id: planId },
  });
  if (!storyPlan) {
    return NextResponse.json(
      { error: "Story plan not found." },
      { status: 404 },
    );
  }

  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: storyPlan.organizationId,
        userId: session.user.id,
      },
    },
  });
  if (!membership) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  await db.storyPlan.delete({
    where: { id: planId },
  });

  return NextResponse.json({ success: true });
}
