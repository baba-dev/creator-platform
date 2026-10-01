import { db } from "@aiwa/db";
import { brandProfileUpdateSchema } from "@aiwa/validation";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ profileId: string }> },
) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  const { profileId } = await params;

  const profile = await db.brandProfile.findUnique({
    where: { id: profileId },
  });

  if (!profile) {
    return NextResponse.json(
      { error: "Brand profile not found." },
      { status: 404 },
    );
  }

  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: profile.organizationId,
        userId: session.user.id,
      },
    },
  });
  if (!membership) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  return NextResponse.json(
    { profile },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ profileId: string }> },
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
  const { profileId } = await params;

  try {
    const existing = await db.brandProfile.findUnique({
      where: { id: profileId },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Brand profile not found." },
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
    const input = brandProfileUpdateSchema.parse(json);

    const updated = await db.brandProfile.update({
      where: { id: profileId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.tagline !== undefined ? { tagline: input.tagline } : {}),
        ...(input.voiceTone !== undefined
          ? { voiceTone: input.voiceTone }
          : {}),
        ...(input.guidelines !== undefined
          ? { guidelines: input.guidelines }
          : {}),
        ...(input.targetAudience !== undefined
          ? { targetAudience: input.targetAudience }
          : {}),
        ...(input.vocabulary !== undefined
          ? { vocabulary: input.vocabulary }
          : {}),
      },
    });

    return NextResponse.json({ profile: updated });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid brand profile update.", issues: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Failed to update brand profile." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ profileId: string }> },
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
  const { profileId } = await params;

  const profile = await db.brandProfile.findUnique({
    where: { id: profileId },
  });
  if (!profile) {
    return NextResponse.json(
      { error: "Brand profile not found." },
      { status: 404 },
    );
  }

  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: profile.organizationId,
        userId: session.user.id,
      },
    },
  });
  if (!membership) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  await db.brandProfile.delete({
    where: { id: profileId },
  });

  return NextResponse.json({ success: true });
}
