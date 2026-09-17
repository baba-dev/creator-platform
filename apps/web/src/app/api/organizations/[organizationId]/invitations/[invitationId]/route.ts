import { db } from "@aiwa/db";
import { revokeOrganizationInvitation } from "@aiwa/organizations";
import { cuidSchema } from "@aiwa/validation";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { organizationError } from "@/lib/organization-api";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

export async function DELETE(
  request: Request,
  {
    params,
  }: { params: Promise<{ organizationId: string; invitationId: string }> },
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

  const { organizationId, invitationId } = await params;
  if (
    !cuidSchema.safeParse(organizationId).success ||
    !cuidSchema.safeParse(invitationId).success
  ) {
    return NextResponse.json(
      { error: "Invitation not found." },
      { status: 404 },
    );
  }

  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: { organizationId, userId: session.user.id },
    },
  });

  try {
    await revokeOrganizationInvitation({
      actor: {
        userId: session.user.id,
        platformRole: session.user.platformRole,
        organizationId,
        organizationRole: membership?.role,
      },
      organizationId,
      invitationId,
    });

    revalidatePath(`/app`, "layout");
    revalidatePath(`/admin/organizations/${organizationId}`);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return organizationError(error);
  }
}
