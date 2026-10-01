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
    super(
      `${
        scope === "member" ? "Member" : "Organization"
      } storage quota exceeded.`,
    );
    this.name = "AssetQuotaExceededError";
  }
}

async function lockUsage(tx: Prisma.TransactionClient, organizationId: string) {
  await tx.assetStorageUsage.upsert({
    where: { organizationId },
    create: { organizationId },
    update: {},
  });
  await tx.$queryRaw`
    SELECT organizationId
    FROM AssetStorageUsage
    WHERE organizationId = ${organizationId}
    FOR UPDATE
  `;
  return tx.assetStorageUsage.findUniqueOrThrow({ where: { organizationId } });
}

/**
 * Atomically reserve storage before a generation/upload accepts work.
 *
 * Organization usage is O(1) via AssetStorageUsage. Member usage is derived
 * from authoritative originals plus variants so the member and organization
 * quotas measure the same physical bytes. The reservation row is locked so
 * concurrent requests cannot oversubscribe either quota.
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
  const member = await getPhysicalAssetStorageUsage(
    tx,
    input.organizationId,
    input.userId,
  );
  const memberUsed = member.physicalBytes + member.reservedBytes;
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
 * Recompute cached organization usage from authoritative Asset and AssetVariant rows.
 * Separates physical capacity accounting (which includes variants and retained trash bytes)
 * from ready asset counts.
 */
export async function reconcileAssetStorageUsage(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  await lockUsage(tx, organizationId);
  const [usedAssets, usedVariants, pending, ready] = await Promise.all([
    tx.asset.aggregate({
      where: {
        organizationId,
        status: { in: ["READY", "QUARANTINED", "DELETED", "PURGING"] },
      },
      _sum: { byteSize: true },
    }),
    tx.assetVariant.aggregate({
      where: {
        asset: {
          organizationId,
          status: { in: ["READY", "QUARANTINED", "DELETED", "PURGING"] },
        },
      },
      _sum: { byteSize: true },
    }),
    tx.asset.aggregate({
      where: { organizationId, status: "PENDING" },
      _sum: { byteSize: true },
    }),
    tx.asset.count({
      where: { organizationId, status: "READY" },
    }),
  ]);

  const totalPhysicalUsed =
    (usedAssets._sum.byteSize ?? 0n) + (usedVariants._sum.byteSize ?? 0n);

  await tx.assetStorageUsage.update({
    where: { organizationId },
    data: {
      usedBytes: totalPhysicalUsed,
      reservedBytes: pending._sum.byteSize ?? 0n,
      readyAssetCount: ready,
      reconciledAt: new Date(),
      version: { increment: 1 },
    },
  });
}

export async function getLogicalAssetStorageUsage(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId?: string,
): Promise<{ logicalBytes: bigint; readyAssetCount: number }> {
  const [active, readyCount] = await Promise.all([
    tx.asset.aggregate({
      where: {
        organizationId,
        ...(userId ? { storageOwnerUserId: userId } : {}),
        status: { in: ["READY", "QUARANTINED"] },
      },
      _sum: { byteSize: true },
    }),
    tx.asset.count({
      where: {
        organizationId,
        ...(userId ? { storageOwnerUserId: userId } : {}),
        status: "READY",
      },
    }),
  ]);
  return {
    logicalBytes: active._sum.byteSize ?? 0n,
    readyAssetCount: readyCount,
  };
}

export async function getPhysicalAssetStorageUsage(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId?: string,
): Promise<{ physicalBytes: bigint; reservedBytes: bigint }> {
  const [usedAssets, usedVariants, pending] = await Promise.all([
    tx.asset.aggregate({
      where: {
        organizationId,
        ...(userId ? { storageOwnerUserId: userId } : {}),
        status: { in: ["READY", "QUARANTINED", "DELETED", "PURGING"] },
      },
      _sum: { byteSize: true },
    }),
    tx.assetVariant.aggregate({
      where: {
        asset: {
          organizationId,
          ...(userId ? { storageOwnerUserId: userId } : {}),
          status: { in: ["READY", "QUARANTINED", "DELETED", "PURGING"] },
        },
      },
      _sum: { byteSize: true },
    }),
    tx.asset.aggregate({
      where: {
        organizationId,
        ...(userId ? { storageOwnerUserId: userId } : {}),
        status: "PENDING",
      },
      _sum: { byteSize: true },
    }),
  ]);
  return {
    physicalBytes:
      (usedAssets._sum.byteSize ?? 0n) + (usedVariants._sum.byteSize ?? 0n),
    reservedBytes: pending._sum.byteSize ?? 0n,
  };
}
