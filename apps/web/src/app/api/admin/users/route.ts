import { hasPlatformPermission } from "@aiwa/authz";
import { adminCreateUserSchema } from "@aiwa/validation";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  AdminUserCredentialError,
  createAdminManagedUser,
} from "@/lib/admin-user-credentials";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

function credentialErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof AdminUserCredentialError)) return null;

  const status =
    error.code === "EMAIL_EXISTS"
      ? 409
      : error.code === "USER_NOT_FOUND"
        ? 404
        : 403;

  return NextResponse.json({ error: error.message }, { status });
}

export async function POST(request: Request) {
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

  const body = await request.json().catch(() => null);
  const parsed = adminCreateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid user details.",
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  try {
    const user = await createAdminManagedUser({
      actor: {
        userId: session.user.id,
        platformRole: session.user.platformRole,
      },
      ...parsed.data,
    });

    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${user.id}`);

    return NextResponse.json(
      {
        ok: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          platformRole: user.platformRole,
          emailVerified: user.emailVerified,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const response = credentialErrorResponse(error);
    if (response) return response;
    console.error("Failed to create admin-managed user", error);
    return NextResponse.json(
      { error: "Failed to create user." },
      { status: 500 },
    );
  }
}
