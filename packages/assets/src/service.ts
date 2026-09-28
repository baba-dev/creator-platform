import type { Prisma } from "@aiwa/db";

export const DEFAULT_MEMBER_STORAGE_QUOTA_BYTES = 1_073_741_824n;
export const DEFAULT_ORGANIZATION_STORAGE_QUOTA_BYTES = 10_737_418_240n;

export class AssetQuotaExceededError extends Error {
  constructor(
    public readonly scope: "member" | "organization",
    public readonly usedBytes: bigint,
    public readonly proposedBytes: bigint,
    public readonly quotaBytes: bigint,
  ) {
    super(`${scope === "member" ? "Member" : "Organization"} storage quota exceeded.`);
    this.name = "AssetQuotaExceededError";
  }
}

async function lockUsage(
  tx: Prisma.TransactionClient,
  organizationId: string,
) {
  await tx.assetStorageUsage.upsert({
    where: { organizationId },
    create: { organizationId },
    update: {},
  });
  await tx.$queryRaw`SELECT organizationId FROM AssetStorageUsage WHERE organizationId = ${organizationId} FOR UPDATE`;
  return tx.assetStorageUsage.findUniqueOrThrow({ where: { organizationId } });
}

/**
 * Atomically reserve storage before a generation/upload accepts work.
 *
 * Organization usage is O(1) via AssetStorageUsage. Member usage is derived
 * from the authoritative Asset rows because member-level counters are not
 * required at current scale. The reservation row is locked so concurrent
 * requests cannot oversubscribe the organization quota.
 */
export async function reserveAssetStorage(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    userId: string;
    proposedBytes: bigint;
    memberQuotaBytes?: bigint;
    organizationQuotaBytes?: bigint;
  },
): Promise<void> {
  if (input.proposedBytes < 0n)
    throw new RangeError("Proposed asset allocation cannot be negative.");

  const usage = await lockUsage(tx, input.organizationId);
  const member = await tx.asset.aggregate({
    where: {
      organizationId: input.organizationId,
      storageOwnerUserId: input.userId,
      status: { in: ["PENDING", "READY", "QUARANTINED"] },
    },
    _sum: { byteSize: true },
  });
  const memberUsed = member._sum.byteSize ?? 0n;
  const memberQuota =
    input.memberQuotaBytes ?? DEFAULT_MEMBER_STORAGE_QUOTA_BYTES;
  const organizationQuota =
    input.organizationQuotaBytes ?? DEFAULT_ORGANIZATION_STORAGE_QUOTA_BYTES;

  if (memberUsed + input.proposedBytes > memberQuota) {
    throw new AssetQuotaExceededError(
      "member",
      memberUsed,
      input.proposedBytes,
      memberQuota,
    );
  }
  const organizationCommitted = usage.usedBytes + usage.reservedBytes;
  if (organizationCommitted + input.proposedBytes > organizationQuota) {
    throw new AssetQuotaExceededError(
      "organization",
      organizationCommitted,
      input.proposedBytes,
      organizationQuota,
    );
  }

  await tx.assetStorageUsage.update({
    where: { organizationId: input.organizationId },
    data: {
      reservedBytes: { increment: input.proposedBytes },
      version: { increment: 1 },
    },
  });
}

/**
 * Convert a PENDING reservation into READY usage after the object is durable.
 * The reserved size is the preflight maximum stored in Asset.byteSize.
 */
export async function finalizeAssetStorage(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    reservedBytes: bigint;
    actualBytes: bigint;
  },
): Promise<void> {
  if (input.actualBytes < 0n || input.reservedBytes < 0n)
    throw new RangeError("Asset storage sizes cannot be negative.");
  const usage = await lockUsage(tx, input.organizationId);
  if (usage.reservedBytes < input.reservedBytes)
    throw new Error("Asset storage reservation accounting is inconsistent.");

  await tx.assetStorageUsage.update({
    where: { organizationId: input.organizationId },
    data: {
      reservedBytes: { decrement: input.reservedBytes },
      usedBytes: { increment: input.actualBytes },
      readyAssetCount: { increment: 1 },
      version: { increment: 1 },
    },
  });
}

/**
 * Release capacity for a PENDING asset that will never become READY.
 */
export async function releaseAssetStorage(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; reservedBytes: bigint },
): Promise<void> {
  if (input.reservedBytes < 0n)
    throw new RangeError("Reserved asset storage cannot be negative.");
  const usage = await lockUsage(tx, input.organizationId);
  if (usage.reservedBytes < input.reservedBytes)
    throw new Error("Asset storage reservation accounting is inconsistent.");
  await tx.assetStorageUsage.update({
    where: { organizationId: input.organizationId },
    data: {
      reservedBytes: { decrement: input.reservedBytes },
      version: { increment: 1 },
    },
  });
}

/**
 * Recompute cached organization usage from authoritative Asset rows.
 * Intended for maintenance/admin reconciliation, not request-path accounting.
 */
export async function reconcileAssetStorageUsage(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  await lockUsage(tx, organizationId);
  const [ready, pending] = await Promise.all([
    tx.asset.aggregate({
      where: { organizationId, status: { in: ["READY", "QUARANTINED"] } },
      _sum: { byteSize: true },
      _count: { id: true },
    }),
    tx.asset.aggregate({
      where: { organizationId, status: "PENDING" },
      _sum: { byteSize: true },
    }),
  ]);
  await tx.assetStorageUsage.update({
    where: { organizationId },
    data: {
      usedBytes: ready._sum.byteSize ?? 0n,
      reservedBytes: pending._sum.byteSize ?? 0n,
      readyAssetCount: ready._count.id,
      reconciledAt: new Date(),
      version: { increment: 1 },
    },
  });
}
