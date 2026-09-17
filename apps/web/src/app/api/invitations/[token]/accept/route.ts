import { db } from "@aiwa/db";
import { acceptOrganizationInvitation } from "@aiwa/organizations";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { organizationError } from "@/lib/organization-api";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
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

  const { token } = await params;
  if (!token || typeof token !== "string") {
    return NextResponse.json(
      { error: "Invitation token required." },
      { status: 400 },
    );
  }

  try {
    const result = await acceptOrganizationInvitation({
      actorUserId: session.user.id,
      token,
    });

    await db.session.updateMany({
      where: { userId: session.user.id },
      data: { activeOrganizationId: result.organization.id },
    });

    revalidatePath("/app", "layout");

    return NextResponse.json({
      ok: true,
      organizationSlug: result.organization.slug,
    });
  } catch (error) {
    return organizationError(error);
  }
}
