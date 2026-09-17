import { db } from "@aiwa/db";
import { removeMember, updateMember } from "@aiwa/organizations";
import {
  cuidSchema,
  changeMembershipRoleSchema,
  changeMonthlyCreditCapSchema,
} from "@aiwa/validation";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import { organizationError } from "@/lib/organization-api";
async function context(request: Request, organizationId: string) {
  const session = await getRequestSession(request.headers);
  if (!session) return null;
  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: { organizationId, userId: session.user.id },
    },
  });
  return {
    session,
    actor: {
      userId: session.user.id,
      platformRole: session.user.platformRole,
      organizationId,
      organizationRole: membership?.role,
    },
  };
}
export async function PATCH(
  request: Request,
  {
    params,
  }: { params: Promise<{ organizationId: string; membershipId: string }> },
) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  const { organizationId, membershipId } = await params;
  if (
    !cuidSchema.safeParse(organizationId).success ||
    !cuidSchema.safeParse(membershipId).success
  )
    return NextResponse.json(
      { error: "Membership not found." },
      { status: 404 },
    );
  const c = await context(request, organizationId);
  if (!c)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const body = await request.json().catch(() => null);
  const role = changeMembershipRoleSchema.safeParse({ ...body, membershipId });
  const cap = changeMonthlyCreditCapSchema.safeParse({ ...body, membershipId });
  if (!role.success && !cap.success)
    return NextResponse.json(
      { error: "Enter a valid role or monthly credit cap." },
      { status: 400 },
    );
  try {
    await updateMember({
      actor: c.actor,
      organizationId,
      membershipId,
      ...(role.success && body.role ? { role: role.data.role } : {}),
      ...(cap.success && "monthlySpendingCapCredits" in body
        ? { monthlySpendingCapCredits: cap.data.monthlySpendingCapCredits }
        : {}),
    });
    revalidatePath(`/admin/organizations/${organizationId}`);
    revalidatePath(`/app`, "layout");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return organizationError(e);
  }
}
export async function DELETE(
  request: Request,
  {
    params,
  }: { params: Promise<{ organizationId: string; membershipId: string }> },
) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  const { organizationId, membershipId } = await params;
  if (
    !cuidSchema.safeParse(organizationId).success ||
    !cuidSchema.safeParse(membershipId).success
  )
    return NextResponse.json(
      { error: "Membership not found." },
      { status: 404 },
    );
  const c = await context(request, organizationId);
  if (!c)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  try {
    await removeMember({ actor: c.actor, organizationId, membershipId });
    revalidatePath(`/admin/organizations/${organizationId}`);
    revalidatePath(`/app`, "layout");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return organizationError(e);
  }
}
