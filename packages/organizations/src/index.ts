import {
  hasOrganizationPermission,
  hasPlatformPermission,
  type OrganizationRole,
  type PlatformRole,
} from "@aiwa/authz";
import { db, Prisma } from "@aiwa/db";

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
  constructor(public readonly scope: "member" | "organization") {
    super(
      "STORAGE_QUOTA_EXCEEDED",
      `${scope === "member" ? "Member" : "Organization"} storage quota exceeded.`,
    );
  }
}
export class PermissionDeniedError extends OrganizationDomainError {
  constructor() {
    super(
      "PERMISSION_DENIED",
      "You do not have permission to perform this action.",
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
    throw new StorageQuotaExceededError("member");
  if (organizationUsed + proposed > ORGANIZATION_STORAGE_QUOTA_BYTES)
    throw new StorageQuotaExceededError("organization");
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
    select: { id: true, status: true, ownerUserId: true },
  });
  if (!organization) throw new OrganizationNotFoundError();
  if (!allowSuspended && organization.status !== "ACTIVE")
    throw new OrganizationSuspendedError();
  return organization;
}

export async function addMember(input: {
  actor: OrganizationActor;
  organizationId: string;
  email: string;
  role: ManagedMemberRole;
  monthlySpendingCapCredits?: bigint | null;
}) {
  authorize(input.actor, input.organizationId, "members");
  return db.$transaction(
    async (tx) => {
      await lockedOrganization(tx, input.organizationId);
      const user = await tx.user.findUnique({
        where: { email: normalizeMemberEmail(input.email) },
        select: { id: true, disabledAt: true },
      });
      if (!user || user.disabledAt) throw new UserUnavailableError();
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
    await tx.organization.update({
      where: { id: input.organizationId },
      data: { ownerUserId: target.userId },
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
