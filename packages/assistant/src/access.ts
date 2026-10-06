import {
  hasOrganizationPermission,
  type OrganizationPermission,
} from "@aiwa/authz";
import { db } from "@aiwa/db";
import { GenerationError } from "@aiwa/generation";
import type { AssistantToolContext } from "./tools/types";

export async function requirePixelAccess(
  ctx: AssistantToolContext,
  permission: OrganizationPermission = "workspace:view",
) {
  const [membership, thread] = await Promise.all([
    db.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
        },
      },
      include: { organization: true },
    }),
    db.chatThread.findFirst({
      where: {
        id: ctx.threadId,
        organizationId: ctx.organizationId,
        createdById: ctx.userId,
        OR: [
          { threadType: "PIXEL" },
          { persona: { tag: "aiwa-pixel-assistant" } },
        ],
      },
      select: { id: true },
    }),
  ]);
  if (
    !thread ||
    !membership ||
    membership.organization.status !== "ACTIVE" ||
    !hasOrganizationPermission(membership.role, permission)
  )
    throw new GenerationError("Pixel workspace access denied.", 403);
  // Slugs supplied by a model or stale client must never control navigation.
  return membership;
}

export function accessibleAssets(ctx: AssistantToolContext) {
  return {
    organizationId: ctx.organizationId,
    status: "READY" as const,
    deletedAt: null,
    OR: [
      { purpose: "GENERAL" as const },
      { purpose: "REFERENCE_INPUT" as const, storageOwnerUserId: ctx.userId },
    ],
  };
}
