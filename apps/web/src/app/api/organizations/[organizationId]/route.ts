import { db } from "@aiwa/db";
import {
  renameOrganization,
  setOrganizationSuspended,
} from "@aiwa/organizations";
import {
  cuidSchema,
  organizationStatusMutationSchema,
  renameOrganizationSchema,
} from "@aiwa/validation";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import { organizationError } from "@/lib/organization-api";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const { organizationId } = await params;
  if (!cuidSchema.safeParse(organizationId).success)
    return NextResponse.json(
      { error: "Organization not found." },
      { status: 404 },
    );
  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: { organizationId, userId: session.user.id },
    },
  });
  const actor = {
    userId: session.user.id,
    platformRole: session.user.platformRole,
    organizationId,
    organizationRole: membership?.role,
  };
  const body = await request.json().catch(() => null);
  try {
    const rename = renameOrganizationSchema.safeParse(body);
    if (rename.success) {
      await renameOrganization({
        actor,
        organizationId,
        name: rename.data.name,
      });
      revalidatePath(`/admin/organizations/${organizationId}`);
      revalidatePath(`/app`, "layout");
      return NextResponse.json({ ok: true });
    }
    const status = organizationStatusMutationSchema.safeParse(body);
    if (status.success) {
      await setOrganizationSuspended({
        actor,
        organizationId,
        suspended: status.data.status === "SUSPENDED",
      });
      revalidatePath(`/admin/organizations/${organizationId}`);
      revalidatePath(`/app`, "layout");
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(
      { error: "Enter a valid organization name or status." },
      { status: 400 },
    );
  } catch (e) {
    return organizationError(e);
  }
}
