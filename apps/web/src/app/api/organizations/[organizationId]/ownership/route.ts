import { db } from "@aiwa/db";
import { transferOwnership } from "@aiwa/organizations";
import { cuidSchema, transferOwnershipSchema } from "@aiwa/validation";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import { organizationError } from "@/lib/organization-api";
export async function POST(
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
  const parsed = transferOwnershipSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Select an existing member." },
      { status: 400 },
    );
  try {
    await transferOwnership({
      actor: {
        userId: session.user.id,
        platformRole: session.user.platformRole,
        organizationId,
        organizationRole: membership?.role,
      },
      organizationId,
      ...parsed.data,
    });
    revalidatePath(`/admin/organizations/${organizationId}`);
    revalidatePath(`/app`, "layout");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return organizationError(e);
  }
}
