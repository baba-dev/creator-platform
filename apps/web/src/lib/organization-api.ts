import type { OrganizationRole, PlatformRole } from "@aiwa/authz";
import { OrganizationDomainError } from "@aiwa/organizations";
import { NextResponse } from "next/server";
export type ApiActor = {
  userId: string;
  platformRole: PlatformRole;
  organizationRole?: OrganizationRole;
  organizationId?: string;
};
export function organizationError(error: unknown) {
  if (!(error instanceof OrganizationDomainError)) throw error;
  const statuses: Record<string, number> = {
    ORGANIZATION_NOT_FOUND: 404,
    PERMISSION_DENIED: 404,
    DUPLICATE_MEMBERSHIP: 409,
    MEMBER_LIMIT_REACHED: 409,
    OWNER_MUTATION_FORBIDDEN: 409,
    INVALID_OWNERSHIP_TRANSFER: 409,
    ORGANIZATION_SUSPENDED: 423,
    USER_UNAVAILABLE: 404,
    USER_NOT_FOUND: 404,
    CANNOT_DISABLE_SELF: 400,
    SOLE_PLATFORM_OWNER: 409,
    STORAGE_QUOTA_EXCEEDED: 409,
    INVITATION_NOT_FOUND: 404,
    INVITATION_EXPIRED: 410,
    INVITATION_REVOKED: 410,
    INVITATION_ALREADY_ACCEPTED: 409,
    INVITATION_EMAIL_MISMATCH: 403,
    USER_EMAIL_UNVERIFIED: 403,
    INVITATION_EMAIL_UNVERIFIED: 403,
  };
  return NextResponse.json(
    { error: error.message, code: error.code },
    { status: statuses[error.code] ?? 400 },
  );
}
