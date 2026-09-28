import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";

import type { RequestSession } from "./request-auth";

export async function requireAssetMembership(
  session: RequestSession,
  organizationId: string,
  manage = false,
) {
  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId: session.user.id,
      },
    },
    include: { organization: true },
  });
  const permission = manage ? "assets:manage" : "assets:read";
  if (
    !membership ||
    membership.organization.status !== "ACTIVE" ||
    !hasOrganizationPermission(membership.role, permission)
  ) {
    return null;
  }
  return membership;
}

export function serializeAsset<
  T extends {
    byteSize: bigint;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date | null;
    purgeAfter?: Date | null;
  },
>(asset: T) {
  return {
    ...asset,
    byteSize: asset.byteSize.toString(),
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
    deletedAt: asset.deletedAt?.toISOString() ?? null,
    purgeAfter: asset.purgeAfter?.toISOString() ?? null,
  };
}
