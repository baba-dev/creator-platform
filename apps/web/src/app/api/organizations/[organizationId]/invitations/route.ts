import { db } from "@aiwa/db";
import { createOrganizationInvitation } from "@aiwa/organizations";
import { createInvitationSchema, cuidSchema } from "@aiwa/validation";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { organizationError } from "@/lib/organization-api";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
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

  const { organizationId } = await params;
  if (!cuidSchema.safeParse(organizationId).success) {
    return NextResponse.json(
      { error: "Organization not found." },
      { status: 404 },
    );
  }

  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: { organizationId, userId: session.user.id },
    },
  });

  const parsed = createInvitationSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid role and optional email." },
      { status: 400 },
    );
  }

  try {
    const invitation = await createOrganizationInvitation({
      actor: {
        userId: session.user.id,
        platformRole: session.user.platformRole,
        organizationId,
        organizationRole: membership?.role,
      },
      organizationId,
      role: parsed.data.role,
      email: parsed.data.email || null,
      expiresInDays: parsed.data.expiresInDays,
    });

    revalidatePath(`/app`, "layout");
    revalidatePath(`/admin/organizations/${organizationId}`);

    return NextResponse.json(
      {
        id: invitation.id,
        token: invitation.token,
        role: invitation.role,
        email: invitation.email,
        expiresAt: invitation.expiresAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (error) {
    return organizationError(error);
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const { organizationId } = await params;
  if (!cuidSchema.safeParse(organizationId).success) {
    return NextResponse.json(
      { error: "Organization not found." },
      { status: 404 },
    );
  }

  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: { organizationId, userId: session.user.id },
    },
  });

  if (session.user.platformRole === "USER" && !membership) {
    return NextResponse.json(
      { error: "Organization not found." },
      { status: 404 },
    );
  }

  const invitations = await db.organizationInvitation.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      token: true,
      role: true,
      email: true,
      status: true,
      expiresAt: true,
      createdAt: true,
      createdBy: { select: { name: true, email: true } },
      acceptedBy: { select: { name: true, email: true } },
    },
    take: 30,
  });

  return NextResponse.json({ invitations });
}
