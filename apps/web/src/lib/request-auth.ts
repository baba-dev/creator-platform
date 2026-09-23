import {
  hasOrganizationPermission,
  hasPlatformPermission,
  platformRoles,
  type OrganizationPermission,
  type PlatformPermission,
  type PlatformRole,
} from "@aiwa/authz";
import { db } from "@aiwa/db";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { auth, type AuthSession } from "./auth";

export type RequestSession = AuthSession & {
  user: AuthSession["user"] & {
    platformRole: PlatformRole;
    twoFactorEnabled?: boolean;
    emailVerified?: boolean;
  };
};

type RequestSessionOptions = {
  allowAdminWithoutMfa?: boolean;
};

export async function getRequestSession(
  requestHeaders?: Headers,
  options: RequestSessionOptions = {},
): Promise<RequestSession | null> {
  const session = await auth.api.getSession({
    headers: requestHeaders ?? (await headers()),
  });

  if (
    !session ||
    session.user.disabledAt ||
    !session.user.platformRole ||
    !platformRoles.includes(session.user.platformRole) ||
    session.user.emailVerified !== true ||
    (session.user.platformRole !== "USER" &&
      !session.user.twoFactorEnabled &&
      !options.allowAdminWithoutMfa)
  ) {
    return null;
  }

  return session as RequestSession;
}

export async function requireRequestSession(
  returnTo = "/app",
  options: RequestSessionOptions = {},
): Promise<RequestSession> {
  const session = await getRequestSession(undefined, options);

  if (!session) {
    redirect(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  }

  return session;
}

export async function requirePlatformPermission(
  permission: PlatformPermission,
  options: RequestSessionOptions = {},
): Promise<RequestSession> {
  const session = await requireRequestSession("/admin", options);

  if (!hasPlatformPermission(session.user.platformRole, permission)) {
    notFound();
  }

  return session;
}

export async function requireOrganizationPermission(
  organizationSlug: string,
  permission: OrganizationPermission,
) {
  const session = await requireRequestSession(`/app/${organizationSlug}`);
  const membership = await db.membership.findFirst({
    where: {
      userId: session.user.id,
      organization: {
        slug: organizationSlug,
        status: "ACTIVE",
      },
    },
    include: {
      organization: {
        include: { wallet: true },
      },
    },
  });

  if (!membership || !hasOrganizationPermission(membership.role, permission)) {
    notFound();
  }

  return { session, membership };
}
