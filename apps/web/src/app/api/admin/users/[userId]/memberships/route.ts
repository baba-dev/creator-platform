import { addMember } from "@aiwa/organizations";
import { attachUserMembershipSchema, cuidSchema } from "@aiwa/validation";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { organizationError } from "@/lib/organization-api";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
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

  const { userId } = await params;
  if (!cuidSchema.safeParse(userId).success) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const parsed = attachUserMembershipSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid organization and role." },
      { status: 400 },
    );
  }

  try {
    const member = await addMember({
      actor: {
        userId: session.user.id,
        platformRole: session.user.platformRole,
        organizationId: parsed.data.organizationId,
      },
      organizationId: parsed.data.organizationId,
      userId,
      role: parsed.data.role,
      monthlySpendingCapCredits: parsed.data.monthlySpendingCapCredits,
    });

    revalidatePath(`/admin/users/${userId}`);
    revalidatePath(`/admin/organizations/${parsed.data.organizationId}`);
    return NextResponse.json({ membershipId: member.id }, { status: 201 });
  } catch (error) {
    return organizationError(error);
  }
}
