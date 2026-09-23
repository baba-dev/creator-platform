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

export async function getRequestSession(
  requestHeaders?: Headers,
): Promise<RequestSession | null> {
  const session = await auth.api.getSession({
    headers: requestHeaders ?? (await headers()),
  });

  if (
    !session ||
    session.user.disabledAt ||
    !session.user.platformRole ||
    !platformRoles.includes(session.user.platformRole)
  ) {
    return null;
  }

  return session as RequestSession;
}

export async function requireRequestSession(
  returnTo = "/app",
): Promise<RequestSession> {
  const session = await getRequestSession();

  if (!session) {
    redirect(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  }

  return session;
}

export async function requirePlatformPermission(
  permission: PlatformPermission,
): Promise<RequestSession> {
  const session = await requireRequestSession("/admin");

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
