import { randomBytes } from "crypto";
import {
  hasOrganizationPermission,
  hasPlatformPermission,
  type OrganizationRole,
  type PlatformRole,
} from "@aiwa/authz";
import { db, Prisma } from "@aiwa/db";
import {
  enqueueMail,
  invitationEmail,
  teamMemberAddedEmail,
  teamMembershipChangedEmail,
} from "@aiwa/mail";

export const MAX_ORGANIZATION_NON_OWNER_MEMBERS = 9;
export const MAX_ORGANIZATION_SEATS = 10;
export const MEMBER_STORAGE_QUOTA_BYTES = 1_073_741_824n;
export const ORGANIZATION_STORAGE_QUOTA_BYTES = 10_737_418_240n;

export type ManagedMemberRole = "ORGANIZATION_MEMBER" | "ORGANIZATION_VIEWER";
export type OrganizationActor = {
  userId: string;
  platformRole: PlatformRole;
  organizationRole?: OrganizationRole;
  organizationId?: string;
};

export class OrganizationDomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "OrganizationDomainError";
  }
}
export class OrganizationNotFoundError extends OrganizationDomainError {
  constructor() {
    super("ORGANIZATION_NOT_FOUND", "Organization not found.");
  }
}
export class OrganizationSuspendedError extends OrganizationDomainError {
  constructor() {
    super("ORGANIZATION_SUSPENDED", "This organization is suspended.");
  }
}
export class UserUnavailableError extends OrganizationDomainError {
  constructor() {
    super(
      "USER_UNAVAILABLE",
      "No active registered account was found for that email.",
    );
  }
}
export class DuplicateMembershipError extends OrganizationDomainError {
  constructor() {
    super("DUPLICATE_MEMBERSHIP", "That user is already a member.");
  }
}
export class MemberLimitReachedError extends OrganizationDomainError {
  constructor() {
    super(
      "MEMBER_LIMIT_REACHED",
      "The organization already has nine non-owner members.",
    );
  }
}
export class OwnerMutationForbiddenError extends OrganizationDomainError {
  constructor() {
    super(
      "OWNER_MUTATION_FORBIDDEN",
      "Transfer ownership before changing or removing the owner.",
    );
  }
}
export class InvalidOwnershipTransferError extends OrganizationDomainError {
  constructor() {
    super(
      "INVALID_OWNERSHIP_TRANSFER",
      "Ownership can only transfer to an existing member.",
    );
  }
}
export class StorageQuotaExceededError extends OrganizationDomainError {
  constructor(
    public readonly scope: "member" | "organization",
    public readonly usedBytes?: bigint,
    public readonly proposedBytes?: bigint,
    public readonly quotaBytes: bigint = scope === "member"
      ? MEMBER_STORAGE_QUOTA_BYTES
      : ORGANIZATION_STORAGE_QUOTA_BYTES,
  ) {
    super(
      "STORAGE_QUOTA_EXCEEDED",
      `${scope === "member" ? "Member" : "Organization"} storage quota exceeded.`,
    );
  }
}
export class PermissionDeniedError extends OrganizationDomainError {
  constructor(message = "You do not have permission to perform this action.") {
    super("PERMISSION_DENIED", message);
  }
}
export class UserNotFoundError extends OrganizationDomainError {
  constructor() {
    super("USER_NOT_FOUND", "User not found.");
  }
}
export class CannotDisableSelfError extends OrganizationDomainError {
  constructor() {
    super("CANNOT_DISABLE_SELF", "You cannot disable your own account.");
  }
}
export class SolePlatformOwnerError extends OrganizationDomainError {
  constructor() {
    super(
      "SOLE_PLATFORM_OWNER",
      "Cannot demote or disable the only active platform owner.",
    );
  }
}
export class InvitationNotFoundError extends OrganizationDomainError {
  constructor() {
    super("INVITATION_NOT_FOUND", "Invitation not found or invalid.");
  }
}
export class InvitationExpiredError extends OrganizationDomainError {
  constructor() {
    super("INVITATION_EXPIRED", "This invitation has expired.");
  }
}
export class InvitationRevokedError extends OrganizationDomainError {
  constructor() {
    super("INVITATION_REVOKED", "This invitation has been revoked.");
  }
}
export class InvitationAlreadyAcceptedError extends OrganizationDomainError {
  constructor() {
    super(
      "INVITATION_ALREADY_ACCEPTED",
      "This invitation has already been accepted.",
    );
  }
}
export class InvitationEmailMismatchError extends OrganizationDomainError {
  constructor(email: string) {
    super(
      "INVITATION_EMAIL_MISMATCH",
      `This invitation was created specifically for ${email}.`,
    );
  }
}
export class UserEmailUnverifiedError extends OrganizationDomainError {
  constructor() {
    super(
      "USER_EMAIL_UNVERIFIED",
      "That user has not verified their email address.",
    );
  }
}
export class InvitationEmailUnverifiedError extends OrganizationDomainError {
  constructor(email?: string) {
    super(
      "INVITATION_EMAIL_UNVERIFIED",
      email
        ? `You must verify your email address (${email}) before accepting this invitation.`
        : "You must verify your email address before accepting this invitation.",
    );
  }
}

export function normalizeMemberEmail(email: string): string {
  return email.trim().toLowerCase();
}
export function usedStorageBytes(
  assets: readonly { byteSize: bigint; status: string }[],
): bigint {
  return assets.reduce(
    (total, asset) =>
      asset.status === "DELETED" ? total : total + asset.byteSize,
    0n,
  );
}
export function availableStorageBytes(used: bigint, quota: bigint): bigint {
  return used >= quota ? 0n : quota - used;
}
export function memberAvailableStorageBytes(used: bigint): bigint {
  return availableStorageBytes(used, MEMBER_STORAGE_QUOTA_BYTES);
}
export function organizationAvailableStorageBytes(used: bigint): bigint {
  return availableStorageBytes(used, ORGANIZATION_STORAGE_QUOTA_BYTES);
}
export function assertStorageAllocationFits(
  memberUsed: bigint,
  organizationUsed: bigint,
  proposed: bigint,
): void {
  if (proposed < 0n)
    throw new RangeError("Proposed allocation cannot be negative.");
  if (memberUsed + proposed > MEMBER_STORAGE_QUOTA_BYTES)
    throw new StorageQuotaExceededError(
      "member",
      memberUsed,
      proposed,
      MEMBER_STORAGE_QUOTA_BYTES,
    );
  if (organizationUsed + proposed > ORGANIZATION_STORAGE_QUOTA_BYTES)
    throw new StorageQuotaExceededError(
      "organization",
      organizationUsed,
      proposed,
      ORGANIZATION_STORAGE_QUOTA_BYTES,
    );
}
export function muscatCalendarMonth(date = new Date()): {
  start: Date;
  end: Date;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Muscat",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return {
    start: new Date(Date.UTC(year, month - 1, 1) - 4 * 60 * 60 * 1000),
    end: new Date(Date.UTC(year, month, 1) - 4 * 60 * 60 * 1000),
  };
}
export function canSpendWithinMonthlyCap(
  cap: bigint | null,
  consumed: bigint,
  proposed: bigint,
): boolean {
  return (
    cap === null ||
    (consumed >= 0n && proposed >= 0n && consumed + proposed <= cap)
  );
}

function authorize(
  actor: OrganizationActor,
  organizationId: string,
  permission: "members" | "rename" | "transfer" | "status",
) {
  if (actor.platformRole !== "USER") {
    const allowed =
      permission === "transfer"
        ? hasPlatformPermission(
            actor.platformRole,
            "organizations:transfer-ownership",
          )
        : hasPlatformPermission(actor.platformRole, "organizations:manage");
    if (allowed) return;
  }
  if (
    permission !== "status" &&
    actor.organizationId === organizationId &&
    actor.organizationRole &&
    hasOrganizationPermission(
      actor.organizationRole,
      permission === "rename"
        ? "organization:manage"
        : permission === "transfer"
          ? "organization:transfer-ownership"
          : "members:manage",
    )
  )
    return;
  throw new PermissionDeniedError();
}
async function audit(
  tx: Prisma.TransactionClient,
  actor: OrganizationActor,
  organizationId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata?: Prisma.InputJsonValue,
) {
  await tx.auditEvent.create({
    data: {
      actorUserId: actor.userId,
      organizationId,
      action,
      targetType,
      targetId,
      metadata,
    },
  });
}
async function lockedOrganization(
  tx: Prisma.TransactionClient,
  organizationId: string,
  allowSuspended = false,
) {
  await tx.$queryRaw`SELECT id FROM Organization WHERE id = ${organizationId} FOR UPDATE`;
  const organization = await tx.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, status: true, ownerUserId: true, name: true },
  });
  if (!organization) throw new OrganizationNotFoundError();
  if (!allowSuspended && organization.status !== "ACTIVE")
    throw new OrganizationSuspendedError();
  return organization;
}

export async function addMember(input: {
  actor: OrganizationActor;
  organizationId: string;
  email?: string;
  userId?: string;
  role: ManagedMemberRole;
  monthlySpendingCapCredits?: bigint | null;
}) {
  authorize(input.actor, input.organizationId, "members");
  return db.$transaction(
    async (tx) => {
      const organization = await lockedOrganization(tx, input.organizationId);
      const user = input.userId
        ? await tx.user.findUnique({
            where: { id: input.userId },
            select: {
              id: true,
              email: true,
              emailVerified: true,
              disabledAt: true,
            },
          })
        : input.email
          ? await tx.user.findUnique({
              where: { email: normalizeMemberEmail(input.email) },
              select: {
                id: true,
                email: true,
                emailVerified: true,
                disabledAt: true,
              },
            })
          : null;
      if (!user || user.disabledAt) throw new UserUnavailableError();
      if (!user.emailVerified) throw new UserEmailUnverifiedError();
      if (
        await tx.membership.findUnique({
          where: {
            organizationId_userId: {
              organizationId: input.organizationId,
              userId: user.id,
            },
          },
        })
      )
        throw new DuplicateMembershipError();
      if (
        (await tx.membership.count({
          where: {
            organizationId: input.organizationId,
            role: { not: "ORGANIZATION_OWNER" },
          },
        })) >= MAX_ORGANIZATION_NON_OWNER_MEMBERS
      )
        throw new MemberLimitReachedError();
      const member = await tx.membership.create({
        data: {
          organizationId: input.organizationId,
          userId: user.id,
          role: input.role,
          monthlySpendingCapCredits:
            input.role === "ORGANIZATION_MEMBER"
              ? input.monthlySpendingCapCredits
              : null,
        },
      });
      await audit(
        tx,
        input.actor,
        input.organizationId,
        "organization.member_added",
        "Membership",
        member.id,
        { membershipId: member.id, userId: user.id },
      );
      await enqueueMail(
        teamMemberAddedEmail({
          to: user.email,
          organizationName: organization.name,
          role: member.role,
          organizationId: input.organizationId,
          userId: user.id,
          membershipId: member.id,
        }),
        tx,
      );
      return member;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function updateMember(input: {
  actor: OrganizationActor;
  organizationId: string;
  membershipId: string;
  role?: ManagedMemberRole;
  monthlySpendingCapCredits?: bigint | null;
}) {
  authorize(input.actor, input.organizationId, "members");
  return db.$transaction(async (tx) => {
    const organization = await lockedOrganization(tx, input.organizationId);
    const member = await tx.membership.findFirst({
      where: { id: input.membershipId, organizationId: input.organizationId },
      include: { user: { select: { email: true } } },
    });
    if (!member) throw new OrganizationNotFoundError();
    if (
      member.userId === organization.ownerUserId ||
      member.role === "ORGANIZATION_OWNER"
    )
      throw new OwnerMutationForbiddenError();
    const role = input.role ?? (member.role as ManagedMemberRole);
    const updated = await tx.membership.update({
      where: { id: member.id },
      data: {
        role,
        monthlySpendingCapCredits:
          role === "ORGANIZATION_VIEWER"
            ? null
            : input.monthlySpendingCapCredits,
      },
    });
    await audit(
      tx,
      input.actor,
      input.organizationId,
      input.role
        ? "organization.member_role_changed"
        : "organization.member_cap_changed",
      "Membership",
      member.id,
      { membershipId: member.id, userId: member.userId },
    );
    await enqueueMail(
      teamMembershipChangedEmail({
        to: member.user.email,
        organizationName: organization.name,
        organizationId: input.organizationId,
        userId: member.userId,
        membershipId: member.id,
        event: input.role ? "ROLE_CHANGED" : "CAP_CHANGED",
        detail: input.role
          ? `Your workspace role is now ${updated.role}.`
          : updated.monthlySpendingCapCredits === null
            ? "Your monthly spending cap was removed."
            : `Your monthly spending cap is now ${updated.monthlySpendingCapCredits.toString()} credits.`,
        eventVersion: updated.updatedAt.getTime().toString(),
      }),
      tx,
    );
    return updated;
  });
}

export async function removeMember(input: {
  actor: OrganizationActor;
  organizationId: string;
  membershipId: string;
}) {
  authorize(input.actor, input.organizationId, "members");
  return db.$transaction(async (tx) => {
    const organization = await lockedOrganization(tx, input.organizationId);
    const member = await tx.membership.findFirst({
      where: { id: input.membershipId, organizationId: input.organizationId },
    });
    if (!member) throw new OrganizationNotFoundError();
    if (
      member.userId === organization.ownerUserId ||
      member.role === "ORGANIZATION_OWNER"
    )
      throw new OwnerMutationForbiddenError();
    await tx.membership.delete({ where: { id: member.id } });
    await tx.session.updateMany({
      where: {
        userId: member.userId,
        activeOrganizationId: input.organizationId,
      },
      data: { activeOrganizationId: null },
    });
    await audit(
      tx,
      input.actor,
      input.organizationId,
      "organization.member_removed",
      "Membership",
      member.id,
      { membershipId: member.id, userId: member.userId },
    );
    await enqueueMail(
      teamMembershipChangedEmail({
        to: member.user.email,
        organizationName: organization.name,
        organizationId: input.organizationId,
        userId: member.userId,
        membershipId: member.id,
        event: "REMOVED",
        eventVersion: "removed",
      }),
      tx,
    );
  });
}

export async function transferOwnership(input: {
  actor: OrganizationActor;
  organizationId: string;
  targetMembershipId: string;
}) {
  authorize(input.actor, input.organizationId, "transfer");
  return db.$transaction(async (tx) => {
    const organization = await lockedOrganization(tx, input.organizationId);
    const target = await tx.membership.findFirst({
      where: {
        id: input.targetMembershipId,
        organizationId: input.organizationId,
        user: { disabledAt: null },
      },
      include: { user: { select: { email: true } } },
    });
    if (!target || target.userId === organization.ownerUserId)
      throw new InvalidOwnershipTransferError();
    const previous = await tx.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: input.organizationId,
          userId: organization.ownerUserId,
        },
      },
      include: { user: { select: { email: true } } },
    });
    if (!previous) throw new InvalidOwnershipTransferError();
    await tx.membership.update({
      where: { id: previous.id },
      data: { role: "ORGANIZATION_MEMBER" },
    });
    await tx.membership.update({
      where: { id: target.id },
      data: { role: "ORGANIZATION_OWNER", monthlySpendingCapCredits: null },
    });
    const ownership = await tx.organization.update({
      where: { id: input.organizationId },
      data: { ownerUserId: target.userId },
      select: { updatedAt: true },
    });
    await audit(
      tx,
      input.actor,
      input.organizationId,
      "organization.ownership_transferred",
      "Organization",
      input.organizationId,
      {
        previousOwnerUserId: previous.userId,
        newOwnerUserId: target.userId,
        targetMembershipId: target.id,
      },
    );
    const eventVersion = ownership.updatedAt.getTime().toString();
    await enqueueMail(
      teamMembershipChangedEmail({
        to: target.user.email,
        organizationName: organization.name,
        organizationId: input.organizationId,
        userId: target.userId,
        membershipId: target.id,
        event: "OWNER_GRANTED",
        eventVersion,
      }),
      tx,
    );
    await enqueueMail(
      teamMembershipChangedEmail({
        to: previous.user.email,
        organizationName: organization.name,
        organizationId: input.organizationId,
        userId: previous.userId,
        membershipId: previous.id,
        event: "OWNER_RELEASED",
        eventVersion,
      }),
      tx,
    );
  });
}

export async function renameOrganization(input: {
  actor: OrganizationActor;
  organizationId: string;
  name: string;
}) {
  authorize(input.actor, input.organizationId, "rename");
  return db.$transaction(async (tx) => {
    await lockedOrganization(tx, input.organizationId);
    const result = await tx.organization.update({
      where: { id: input.organizationId },
      data: { name: input.name },
    });
    await audit(
      tx,
      input.actor,
      input.organizationId,
      "organization.renamed",
      "Organization",
      input.organizationId,
    );
    return result;
  });
}
export async function setOrganizationSuspended(input: {
  actor: OrganizationActor;
  organizationId: string;
  suspended: boolean;
}) {
  authorize(input.actor, input.organizationId, "status");
  return db.$transaction(async (tx) => {
    await lockedOrganization(tx, input.organizationId, true);
    const result = await tx.organization.update({
      where: { id: input.organizationId },
      data: { status: input.suspended ? "SUSPENDED" : "ACTIVE" },
    });
    if (input.suspended)
      await tx.session.updateMany({
        where: { activeOrganizationId: input.organizationId },
        data: { activeOrganizationId: null },
      });
    await audit(
      tx,
      input.actor,
      input.organizationId,
      input.suspended ? "organization.suspended" : "organization.reactivated",
      "Organization",
      input.organizationId,
    );
    return result;
  });
}

export async function getStorageUsage(organizationId: string, userId?: string) {
  const result = await db.asset.aggregate({
    where: {
      organizationId,
      storageOwnerUserId: userId,
      status: { not: "DELETED" },
    },
    _sum: { byteSize: true },
  });
  return result._sum.byteSize ?? 0n;
}

/**
 * Locks the organization while calculating both quota scopes. Asset creation
 * must run in the callback so a check and allocation cannot race each other.
 */
export async function withStorageAllocation<T>(input: {
  organizationId: string;
  storageOwnerUserId: string;
  proposedBytes: bigint;
  allocate: (transaction: Prisma.TransactionClient) => Promise<T>;
}): Promise<T> {
  return db.$transaction(
    async (transaction) => {
      await lockedOrganization(transaction, input.organizationId);
      const [member, organization] = await Promise.all([
        transaction.asset.aggregate({
          where: {
            organizationId: input.organizationId,
            storageOwnerUserId: input.storageOwnerUserId,
            status: { not: "DELETED" },
          },
          _sum: { byteSize: true },
        }),
        transaction.asset.aggregate({
          where: {
            organizationId: input.organizationId,
            status: { not: "DELETED" },
          },
          _sum: { byteSize: true },
        }),
      ]);
      assertStorageAllocationFits(
        member._sum.byteSize ?? 0n,
        organization._sum.byteSize ?? 0n,
        input.proposedBytes,
      );
      return input.allocate(transaction);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function lockActivePlatformOwners(
  tx: Prisma.TransactionClient,
): Promise<Array<{ id: string }>> {
  return tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM User
    WHERE platformRole = 'PLATFORM_OWNER' AND disabledAt IS NULL
    ORDER BY id
    FOR UPDATE
  `;
}

function assertActivePlatformOwnerInvariant(
  lockedOwners: readonly { id: string }[],
  targetUserId: string,
): void {
  if (!lockedOwners.some((owner) => owner.id !== targetUserId)) {
    throw new SolePlatformOwnerError();
  }
}

export async function setUserPlatformRole(input: {
  actor: { userId: string; platformRole: PlatformRole };
  targetUserId: string;
  role: PlatformRole;
}) {
  if (input.actor.platformRole !== "PLATFORM_OWNER") {
    throw new PermissionDeniedError(
      "Only platform owners can change platform roles.",
    );
  }
  return db.$transaction(async (tx) => {
    const lockedOwners = await lockActivePlatformOwners(tx);
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${input.targetUserId} FOR UPDATE`;
    const targetUser = await tx.user.findUnique({
      where: { id: input.targetUserId },
      select: { id: true, platformRole: true, disabledAt: true },
    });
    if (!targetUser) throw new UserNotFoundError();

    if (
      targetUser.platformRole === "PLATFORM_OWNER" &&
      input.role !== "PLATFORM_OWNER"
    ) {
      assertActivePlatformOwnerInvariant(lockedOwners, targetUser.id);
    }

    const updated = await tx.user.update({
      where: { id: targetUser.id },
      data: { platformRole: input.role },
    });

    await tx.auditEvent.create({
      data: {
        actorUserId: input.actor.userId,
        action: "user.platform_role_changed",
        targetType: "User",
        targetId: targetUser.id,
        metadata: {
          previousRole: targetUser.platformRole,
          newRole: input.role,
        },
      },
    });

    return updated;
  });
}

export async function setUserDisabled(input: {
  actor: { userId: string; platformRole: PlatformRole };
  targetUserId: string;
  disabled: boolean;
}) {
  if (!hasPlatformPermission(input.actor.platformRole, "users:manage")) {
    throw new PermissionDeniedError();
  }
  if (input.actor.userId === input.targetUserId && input.disabled) {
    throw new CannotDisableSelfError();
  }
  return db.$transaction(async (tx) => {
    const lockedOwners = await lockActivePlatformOwners(tx);
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${input.targetUserId} FOR UPDATE`;
    const targetUser = await tx.user.findUnique({
      where: { id: input.targetUserId },
      select: { id: true, platformRole: true, disabledAt: true },
    });
    if (!targetUser) throw new UserNotFoundError();

    if (input.disabled && targetUser.platformRole === "PLATFORM_OWNER") {
      assertActivePlatformOwnerInvariant(lockedOwners, targetUser.id);
    }

    const updated = await tx.user.update({
      where: { id: targetUser.id },
      data: { disabledAt: input.disabled ? new Date() : null },
    });

    if (input.disabled) {
      await tx.session.deleteMany({
        where: { userId: targetUser.id },
      });
    }

    await tx.auditEvent.create({
      data: {
        actorUserId: input.actor.userId,
        action: input.disabled ? "user.disabled" : "user.enabled",
        targetType: "User",
        targetId: targetUser.id,
        metadata: {
          previousDisabledAt: targetUser.disabledAt?.toISOString() ?? null,
          newDisabledAt: input.disabled
            ? updated.disabledAt?.toISOString()
            : null,
        },
      },
    });

    return updated;
  });
}

export async function revokeUserSessions(input: {
  actor: { userId: string; platformRole: PlatformRole };
  targetUserId: string;
  sessionId?: string;
}) {
  if (!hasPlatformPermission(input.actor.platformRole, "users:manage")) {
    throw new PermissionDeniedError();
  }
  return db.$transaction(async (tx) => {
    const targetUser = await tx.user.findUnique({
      where: { id: input.targetUserId },
      select: { id: true },
    });
    if (!targetUser) throw new UserNotFoundError();

    const where = input.sessionId
      ? { id: input.sessionId, userId: targetUser.id }
      : { userId: targetUser.id };

    const deleted = await tx.session.deleteMany({ where });

    await tx.auditEvent.create({
      data: {
        actorUserId: input.actor.userId,
        action: "user.sessions_revoked",
        targetType: "User",
        targetId: targetUser.id,
        metadata: {
          revokedCount: deleted.count,
          sessionId: input.sessionId ?? null,
        },
      },
    });

    return deleted;
  });
}

export async function setUserEmailVerified(input: {
  actor: { userId: string; platformRole: PlatformRole };
  targetUserId: string;
  verified: boolean;
  reason?: string;
}) {
  if (!hasPlatformPermission(input.actor.platformRole, "users:manage")) {
    throw new PermissionDeniedError();
  }
  if (input.verified && input.actor.platformRole !== "PLATFORM_OWNER") {
    throw new PermissionDeniedError(
      "Only a Platform Owner may administratively attest email verification.",
    );
  }
  const reason = input.reason?.trim();
  if (input.verified && (!reason || reason.length < 8)) {
    throw new PermissionDeniedError(
      "Administrative email verification requires an audit reason.",
    );
  }
  return db.$transaction(async (tx) => {
    const targetUser = await tx.user.findUnique({
      where: { id: input.targetUserId },
      select: { id: true, email: true, emailVerified: true },
    });
    if (!targetUser) throw new UserNotFoundError();

    const updated = await tx.user.update({
      where: { id: targetUser.id },
      data: { emailVerified: input.verified },
    });

    await tx.auditEvent.create({
      data: {
        actorUserId: input.actor.userId,
        action: input.verified
          ? "user.email_verified"
          : "user.email_unverified",
        targetType: "User",
        targetId: targetUser.id,
        metadata: {
          email: targetUser.email,
          previousEmailVerified: targetUser.emailVerified,
          newEmailVerified: input.verified,
          reason: reason ?? null,
          verificationSource: input.verified
            ? "platform_owner_attestation"
            : "administrative_revocation",
        },
      },
    });

    return updated;
  });
}

export function generateInvitationToken(): string {
  return randomBytes(24).toString("hex");
}

export async function createOrganizationInvitation(input: {
  actor: OrganizationActor;
  organizationId: string;
  role: ManagedMemberRole;
  email?: string | null;
  expiresInDays?: number;
}) {
  authorize(input.actor, input.organizationId, "members");
  return db.$transaction(
    async (tx) => {
      const organization = await lockedOrganization(tx, input.organizationId);

      const nonOwnerCount = await tx.membership.count({
        where: {
          organizationId: input.organizationId,
          role: { not: "ORGANIZATION_OWNER" },
        },
      });
      if (nonOwnerCount >= MAX_ORGANIZATION_NON_OWNER_MEMBERS) {
        throw new MemberLimitReachedError();
      }

      const days = input.expiresInDays ?? 7;
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      const token = generateInvitationToken();
      const normalizedEmail = input.email
        ? normalizeMemberEmail(input.email)
        : null;

      const invitation = await tx.organizationInvitation.create({
        data: {
          organizationId: input.organizationId,
          token,
          email: normalizedEmail,
          role: input.role,
          expiresAt,
          createdById: input.actor.userId,
        },
      });

      await audit(
        tx,
        input.actor,
        input.organizationId,
        "organization.invitation_created",
        "OrganizationInvitation",
        invitation.id,
        {
          invitationId: invitation.id,
          role: input.role,
          email: normalizedEmail,
          expiresAt: expiresAt.toISOString(),
        },
      );

      if (normalizedEmail) {
        const appUrl = process.env.APP_URL ?? "http://localhost:3000";
        await enqueueMail(
          invitationEmail({
            to: normalizedEmail,
            organizationName: organization.name,
            organizationId: input.organizationId,
            role: input.role,
            invitationId: invitation.id,
            invitationUrl: new URL(
              `/invite/${encodeURIComponent(token)}`,
              appUrl,
            ).toString(),
          }),
          tx,
        );
      }

      return invitation;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function revokeOrganizationInvitation(input: {
  actor: OrganizationActor;
  organizationId: string;
  invitationId: string;
}) {
  authorize(input.actor, input.organizationId, "members");
  return db.$transaction(async (tx) => {
    const invitation = await tx.organizationInvitation.findFirst({
      where: {
        id: input.invitationId,
        organizationId: input.organizationId,
      },
    });
    if (!invitation) throw new InvitationNotFoundError();
    if (invitation.status !== "PENDING") return invitation;

    const updated = await tx.organizationInvitation.update({
      where: { id: invitation.id },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
      },
    });

    await audit(
      tx,
      input.actor,
      input.organizationId,
      "organization.invitation_revoked",
      "OrganizationInvitation",
      invitation.id,
      { invitationId: invitation.id },
    );

    return updated;
  });
}

export async function acceptOrganizationInvitation(input: {
  actorUserId: string;
  token: string;
}) {
  return db.$transaction(
    async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: input.actorUserId },
        select: {
          id: true,
          email: true,
          emailVerified: true,
          disabledAt: true,
        },
      });
      if (!user || user.disabledAt) throw new UserUnavailableError();

      const invitation = await tx.organizationInvitation.findUnique({
        where: { token: input.token },
        include: { organization: true },
      });

      if (!invitation) throw new InvitationNotFoundError();

      if (invitation.status === "ACCEPTED") {
        throw new InvitationAlreadyAcceptedError();
      }
      if (invitation.status === "REVOKED") {
        throw new InvitationRevokedError();
      }
      if (
        invitation.status === "EXPIRED" ||
        invitation.expiresAt.getTime() < Date.now()
      ) {
        if (invitation.status !== "EXPIRED") {
          await tx.organizationInvitation.update({
            where: { id: invitation.id },
            data: { status: "EXPIRED" },
          });
        }
        throw new InvitationExpiredError();
      }

      if (
        invitation.email &&
        normalizeMemberEmail(user.email) !==
          normalizeMemberEmail(invitation.email)
      ) {
        throw new InvitationEmailMismatchError(invitation.email);
      }

      if (!user.emailVerified) {
        throw new InvitationEmailUnverifiedError(invitation.email ?? undefined);
      }

      await lockedOrganization(tx, invitation.organizationId);

      const existingMembership = await tx.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId: user.id,
          },
        },
      });
      if (existingMembership) {
        throw new DuplicateMembershipError();
      }

      const nonOwnerCount = await tx.membership.count({
        where: {
          organizationId: invitation.organizationId,
          role: { not: "ORGANIZATION_OWNER" },
        },
      });
      if (nonOwnerCount >= MAX_ORGANIZATION_NON_OWNER_MEMBERS) {
        throw new MemberLimitReachedError();
      }

      const membership = await tx.membership.create({
        data: {
          organizationId: invitation.organizationId,
          userId: user.id,
          role: invitation.role,
        },
      });

      const now = new Date();
      await tx.organizationInvitation.update({
        where: { id: invitation.id },
        data: {
          status: "ACCEPTED",
          acceptedById: user.id,
          acceptedAt: now,
        },
      });

      await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          organizationId: invitation.organizationId,
          action: "organization.invitation_accepted",
          targetType: "OrganizationInvitation",
          targetId: invitation.id,
          metadata: {
            invitationId: invitation.id,
            membershipId: membership.id,
            userId: user.id,
            role: invitation.role,
          },
        },
      });

      return { membership, organization: invitation.organization };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export interface MemberBudgetStatus {
  readonly monthlyCapCredits: bigint | null;
  readonly currentMonthSpentCredits: bigint;
  readonly proposedCredits: bigint;
  readonly canSpend: boolean;
  readonly remainingCredits: bigint | null;
}

export async function getMemberMonthlySpentCredits(
  organizationId: string,
  userId: string,
  date = new Date(),
): Promise<bigint> {
  const { start, end } = muscatCalendarMonth(date);
  const jobs = await db.generationJob.findMany({
    where: {
      organizationId,
      createdById: userId,
      status: { notIn: ["CANCELLED", "FAILED", "DRAFT"] },
      createdAt: { gte: start, lt: end },
    },
    select: {
      status: true,
      reservedCredits: true,
      chargedCredits: true,
    },
  });

  return jobs.reduce((total, job) => {
    const credits =
      job.status === "SUCCEEDED" ? job.chargedCredits : job.reservedCredits;
    return total + credits;
  }, 0n);
}

export async function checkMemberSpendingBudget(input: {
  organizationId: string;
  userId: string;
  proposedCredits: bigint;
  date?: Date;
}): Promise<MemberBudgetStatus> {
  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.userId,
      },
    },
    select: {
      monthlySpendingCapCredits: true,
    },
  });

  const cap = membership?.monthlySpendingCapCredits ?? null;
  const spent = await getMemberMonthlySpentCredits(
    input.organizationId,
    input.userId,
    input.date,
  );

  const canSpend = canSpendWithinMonthlyCap(cap, spent, input.proposedCredits);
  const remaining = cap === null ? null : cap > spent ? cap - spent : 0n;

  return {
    monthlyCapCredits: cap,
    currentMonthSpentCredits: spent,
    proposedCredits: input.proposedCredits,
    canSpend,
    remainingCredits: remaining,
  };
}

export class ProjectNotFoundError extends OrganizationDomainError {
  constructor() {
    super("PROJECT_NOT_FOUND", "Project not found.");
  }
}

export class ProjectArchivedError extends OrganizationDomainError {
  constructor() {
    super(
      "PROJECT_ARCHIVED",
      "Archived projects cannot receive new generations.",
    );
  }
}

function authorizeProject(
  actor: OrganizationActor,
  organizationId: string,
  permission: "read" | "write",
): void {
  if (
    actor.organizationId === organizationId &&
    actor.organizationRole &&
    hasOrganizationPermission(
      actor.organizationRole,
      permission === "write" ? "projects:write" : "projects:read",
    )
  ) {
    return;
  }
  if (
    actor.platformRole !== "USER" &&
    hasPlatformPermission(actor.platformRole, "organizations:manage")
  ) {
    return;
  }
  throw new PermissionDeniedError();
}

function normalizeProjectName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, " ");
  if (normalized.length < 1 || normalized.length > 80) {
    throw new OrganizationDomainError(
      "INVALID_PROJECT_NAME",
      "Project name must be between 1 and 80 characters.",
    );
  }
  return normalized;
}

function normalizeProjectDescription(
  description?: string | null,
): string | null {
  const normalized = description?.trim() ?? "";
  if (normalized.length > 2000) {
    throw new OrganizationDomainError(
      "INVALID_PROJECT_DESCRIPTION",
      "Project description cannot exceed 2,000 characters.",
    );
  }
  return normalized || null;
}

export async function createProject(input: {
  actor: OrganizationActor;
  organizationId: string;
  name: string;
  description?: string | null;
}) {
  authorizeProject(input.actor, input.organizationId, "write");
  const name = normalizeProjectName(input.name);
  const description = normalizeProjectDescription(input.description);

  return db.$transaction(async (tx) => {
    await lockedOrganization(tx, input.organizationId);
    const project = await tx.project.create({
      data: {
        organizationId: input.organizationId,
        name,
        description,
      },
    });
    await audit(
      tx,
      input.actor,
      input.organizationId,
      "project.created",
      "Project",
      project.id,
      { name: project.name },
    );
    return project;
  });
}

export async function updateProject(input: {
  actor: OrganizationActor;
  organizationId: string;
  projectId: string;
  name: string;
  description?: string | null;
}) {
  authorizeProject(input.actor, input.organizationId, "write");
  const name = normalizeProjectName(input.name);
  const description = normalizeProjectDescription(input.description);

  return db.$transaction(async (tx) => {
    await lockedOrganization(tx, input.organizationId);
    const existing = await tx.project.findFirst({
      where: { id: input.projectId, organizationId: input.organizationId },
    });
    if (!existing) throw new ProjectNotFoundError();
    if (existing.archivedAt) throw new ProjectArchivedError();

    const project = await tx.project.update({
      where: { id: existing.id },
      data: { name, description },
    });
    await audit(
      tx,
      input.actor,
      input.organizationId,
      "project.updated",
      "Project",
      project.id,
      {
        previousName: existing.name,
        name: project.name,
      },
    );
    return project;
  });
}

export async function setProjectArchived(input: {
  actor: OrganizationActor;
  organizationId: string;
  projectId: string;
  archived: boolean;
}) {
  authorizeProject(input.actor, input.organizationId, "write");

  return db.$transaction(async (tx) => {
    await lockedOrganization(tx, input.organizationId);
    const existing = await tx.project.findFirst({
      where: { id: input.projectId, organizationId: input.organizationId },
    });
    if (!existing) throw new ProjectNotFoundError();

    if (Boolean(existing.archivedAt) === input.archived) return existing;

    const project = await tx.project.update({
      where: { id: existing.id },
      data: { archivedAt: input.archived ? new Date() : null },
    });
    await audit(
      tx,
      input.actor,
      input.organizationId,
      input.archived ? "project.archived" : "project.restored",
      "Project",
      project.id,
    );
    return project;
  });
}

export async function assertAssignableProject(
  tx: Prisma.TransactionClient,
  organizationId: string,
  projectId?: string | null,
) {
  if (!projectId) return null;
  const project = await tx.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true, archivedAt: true },
  });
  if (!project) throw new ProjectNotFoundError();
  if (project.archivedAt) throw new ProjectArchivedError();
  return project;
}
