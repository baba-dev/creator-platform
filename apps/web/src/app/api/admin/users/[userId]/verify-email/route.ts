import { setUserEmailVerified } from "@aiwa/organizations";
import { cuidSchema } from "@aiwa/validation";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { organizationError } from "@/lib/organization-api";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const verifyEmailBodySchema = z.object({
  verified: z.boolean().default(true),
});

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

  if (session.user.platformRole !== "USER" && !session.user.twoFactorEnabled) {
    return NextResponse.json(
      {
        error:
          "Multi-factor authentication is required for administrative accounts.",
        code: "MFA_REQUIRED",
      },
      { status: 403 },
    );
  }

  const { userId } = await params;
  if (!cuidSchema.safeParse(userId).success) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({ verified: true }));
  const parsed = verifyEmailBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request payload." },
      { status: 400 },
    );
  }

  try {
    const updated = await setUserEmailVerified({
      actor: {
        userId: session.user.id,
        platformRole: session.user.platformRole,
      },
      targetUserId: userId,
      verified: parsed.data.verified,
    });

    revalidatePath(`/admin/users/${userId}`);
    return NextResponse.json({
      userId: updated.id,
      emailVerified: updated.emailVerified,
    });
  } catch (error) {
    return organizationError(error);
  }
}
