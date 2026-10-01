import { hasPlatformPermission } from "@aiwa/authz";
import { adminResetPasswordSchema, userRecordIdSchema } from "@aiwa/validation";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  AdminUserCredentialError,
  resetAdminManagedUserPassword,
} from "@/lib/admin-user-credentials";
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
  if (!hasPlatformPermission(session.user.platformRole, "users:manage")) {
    return NextResponse.json(
      { error: "You do not have permission to manage users." },
      { status: 403 },
    );
  }

  const { userId } = await params;
  if (!userRecordIdSchema.safeParse(userId).success) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = adminResetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Password must be between 12 and 128 characters.",
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  try {
    const result = await resetAdminManagedUserPassword({
      actor: {
        userId: session.user.id,
        platformRole: session.user.platformRole,
      },
      targetUserId: userId,
      password: parsed.data.password,
    });

    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);

    return NextResponse.json({
      ok: true,
      revokedSessions: result.revokedSessions,
    });
  } catch (error) {
    if (error instanceof AdminUserCredentialError) {
      const status =
        error.code === "USER_NOT_FOUND"
          ? 404
          : error.code === "EMAIL_EXISTS"
            ? 409
            : 403;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error("Failed to reset admin-managed user password", error);
    return NextResponse.json(
      { error: "Failed to reset password." },
      { status: 500 },
    );
  }
}
