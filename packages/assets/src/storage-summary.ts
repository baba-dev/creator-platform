import type { PrismaClient } from "@aiwa/db";
import {
  DEFAULT_MEMBER_STORAGE_QUOTA_BYTES,
  DEFAULT_ORGANIZATION_STORAGE_QUOTA_BYTES,
  getPhysicalAssetStorageUsage,
} from "./service";
import {
  resolveExternalStorage,
  type StorageResolverOptions,
} from "./byos/resolver";

export async function getUserStorageSummary(
  db: PrismaClient,
  organizationId: string,
  userId: string,
  options: StorageResolverOptions,
) {
  const retained = {
    organizationId,
    storageOwnerUserId: userId,
    status: {
      in: ["READY", "QUARANTINED", "DELETED", "PURGING"] as (
        "READY" | "QUARANTINED" | "DELETED" | "PURGING"
      )[],
    },
  };
  const [originals, variants, member, workspace, configs] = await Promise.all([
    db.asset.groupBy({
      by: ["storageProvider"],
      where: retained,
      _sum: { byteSize: true },
    }),
    db.assetVariant.groupBy({
      by: ["storageProvider"],
      where: { asset: retained },
      _sum: { byteSize: true },
    }),
    getPhysicalAssetStorageUsage(db, organizationId, userId),
    getPhysicalAssetStorageUsage(db, organizationId),
    db.externalStorageConfig.findMany({
      where: { organizationId },
      select: { provider: true, status: true },
    }),
  ]);
  const remaining = (limit: bigint, used: bigint) =>
    limit > used ? limit - used : 0n;
  const memberAvailable = remaining(
    DEFAULT_MEMBER_STORAGE_QUOTA_BYTES,
    member.physicalBytes + member.reservedBytes,
  );
  const workspaceAvailable = remaining(
    DEFAULT_ORGANIZATION_STORAGE_QUOTA_BYTES,
    workspace.physicalBytes + workspace.reservedBytes,
  );
  const pools = await Promise.all(
    (["LOCAL", "GOOGLE_DRIVE", "ONEDRIVE"] as const).map(async (provider) => {
      const yourUsedBytes = [...originals, ...variants]
        .filter((row) => row.storageProvider === provider)
        .reduce((total, row) => total + (row._sum.byteSize ?? 0n), 0n)
        .toString();
      if (provider === "LOCAL")
        return {
          provider,
          yourUsedBytes,
          status: "available",
          quota: {
            totalBytes: DEFAULT_MEMBER_STORAGE_QUOTA_BYTES.toString(),
            usedBytes: member.physicalBytes.toString(),
            availableBytes: (memberAvailable < workspaceAvailable
              ? memberAvailable
              : workspaceAvailable
            ).toString(),
          },
        };
      const config = configs.find((row) => row.provider === provider);
      if (!config || config.status !== "ACTIVE")
        return {
          provider,
          yourUsedBytes,
          status: config ? "reconnect" : "disconnected",
          quota: null,
        };
      try {
        const storage = await resolveExternalStorage(
          db,
          organizationId,
          provider,
          options,
        );
        const quota = await storage.getQuota!();
        return { provider, yourUsedBytes, status: "available", quota };
      } catch {
        // Do not expose provider responses, account tokens or configuration secrets.
        return { provider, yourUsedBytes, status: "unavailable", quota: null };
      }
    }),
  );
  return { pools, reservedBytes: member.reservedBytes.toString() };
}
