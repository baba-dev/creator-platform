import { db, type Prisma } from "@aiwa/db";
import { brandProfileCreateSchema } from "@aiwa/validation";
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

  const profiles = await db.brandProfile.findMany({
    where: { organizationId },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(
    { profiles },
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
    const input = brandProfileCreateSchema.parse(json);

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

    const profile = await db.brandProfile.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        tagline: input.tagline ?? null,
        voiceTone: input.voiceTone ?? null,
        guidelines: input.guidelines ?? null,
        targetAudience: input.targetAudience ?? null,
        vocabulary:
          (input.vocabulary as unknown as Prisma.InputJsonValue) ?? undefined,
        createdById: session.user.id,
      },
    });

    return NextResponse.json({ profile }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid brand profile data.", issues: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Failed to create brand profile." },
      { status: 500 },
    );
  }
}
