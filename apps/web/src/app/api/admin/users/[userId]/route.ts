import {
  revokeUserSessions,
  setUserDisabled,
  setUserPlatformRole,
} from "@aiwa/organizations";
import {
  changePlatformRoleSchema,
  cuidSchema,
  userAccessMutationSchema,
} from "@aiwa/validation";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { organizationError } from "@/lib/organization-api";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

export async function PATCH(
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

  const actor = {
    userId: session.user.id,
    platformRole: session.user.platformRole,
  };

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) {
    return NextResponse.json(
      { error: "Invalid request payload." },
      { status: 400 },
    );
  }

  try {
    if ("role" in body) {
      const parsed = changePlatformRoleSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid platform role." },
          { status: 400 },
        );
      }
      await setUserPlatformRole({
        actor,
        targetUserId: userId,
        role: parsed.data.role,
      });
      revalidatePath(`/admin/users`);
      revalidatePath(`/admin/users/${userId}`);
      return NextResponse.json({ ok: true });
    }

    if ("disabled" in body) {
      const parsed = userAccessMutationSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid access status." },
          { status: 400 },
        );
      }
      await setUserDisabled({
        actor,
        targetUserId: userId,
        disabled: parsed.data.disabled,
      });
      revalidatePath(`/admin/users`);
      revalidatePath(`/admin/users/${userId}`);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "revoke_sessions") {
      const sessionId =
        typeof body.sessionId === "string" ? body.sessionId : undefined;
      await revokeUserSessions({
        actor,
        targetUserId: userId,
        sessionId,
      });
      revalidatePath(`/admin/users/${userId}`);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { error: "No recognized user action provided." },
      { status: 400 },
    );
  } catch (error) {
    return organizationError(error);
  }
}
