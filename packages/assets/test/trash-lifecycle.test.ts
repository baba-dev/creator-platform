import type { Prisma } from "@aiwa/db";
import { describe, expect, it, vi } from "vitest";

import {
  claimExpiredAssetForPurge,
  completeAssetPurge,
  restoreAssets,
} from "../src/library";

describe("asset trash lifecycle", () => {
  it("claims expired DELETED assets as PURGING before exposing object keys", async () => {
    const assetUpdate = vi.fn().mockResolvedValue({});
    const variantFindMany = vi
      .fn()
      .mockResolvedValue([{ objectKey: "org/org_1/variants/v1.webp" }]);
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      asset: {
        findFirst: vi.fn().mockResolvedValue({
          id: "asset_1",
          organizationId: "org_1",
          status: "DELETED",
          purgeAfter: new Date("2026-09-01T00:00:00.000Z"),
          objectKey: "org/org_1/assets/a1.png",
          byteSize: 100n,
        }),
        update: assetUpdate,
      },
      assetVariant: {
        findMany: variantFindMany,
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      claimExpiredAssetForPurge(tx, {
        assetId: "asset_1",
        organizationId: "org_1",
        now: new Date("2026-10-01T00:00:00.000Z"),
      }),
    ).resolves.toEqual({
      id: "asset_1",
      organizationId: "org_1",
      objectKey: "org/org_1/assets/a1.png",
      byteSize: 100n,
      variants: [{ objectKey: "org/org_1/variants/v1.webp" }],
    });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(assetUpdate).toHaveBeenCalledWith({
      where: { id: "asset_1" },
      data: { status: "PURGING" },
    });
    expect(assetUpdate.mock.invocationCallOrder[0]!).toBeLessThan(
      variantFindMany.mock.invocationCallOrder[0]!,
    );
  });

  it("allows PURGING assets to be retried without making them restorable", async () => {
    const purgeTx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      asset: {
        findFirst: vi.fn().mockResolvedValue({
          id: "asset_1",
          organizationId: "org_1",
          status: "PURGING",
          purgeAfter: new Date("2026-09-01T00:00:00.000Z"),
          objectKey: "org/org_1/assets/a1.png",
          byteSize: 100n,
        }),
        update: vi.fn(),
      },
      assetVariant: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      claimExpiredAssetForPurge(purgeTx, {
        assetId: "asset_1",
        organizationId: "org_1",
        now: new Date("2026-10-01T00:00:00.000Z"),
      }),
    ).resolves.toMatchObject({ id: "asset_1" });
    expect(purgeTx.asset.update).not.toHaveBeenCalled();

    const restoreUpdate = vi.fn();
    const restoreUsageUpdate = vi.fn();
    const restoreTx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      asset: {
        findFirst: vi.fn().mockResolvedValue({
          id: "asset_1",
          organizationId: "org_1",
          status: "PURGING",
        }),
        update: restoreUpdate,
      },
      assetStorageUsage: {
        updateMany: restoreUsageUpdate,
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      restoreAssets(restoreTx, {
        organizationId: "org_1",
        assetIds: ["asset_1"],
      }),
    ).resolves.toBe(0);
    expect(restoreUpdate).not.toHaveBeenCalled();
    expect(restoreUsageUpdate).not.toHaveBeenCalled();
  });

  it("restores only while the locked row is still DELETED", async () => {
    const assetUpdate = vi.fn().mockResolvedValue({});
    const usageUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      asset: {
        findFirst: vi.fn().mockResolvedValue({
          id: "asset_1",
          organizationId: "org_1",
          status: "DELETED",
        }),
        update: assetUpdate,
      },
      assetStorageUsage: {
        updateMany: usageUpdate,
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      restoreAssets(tx, {
        organizationId: "org_1",
        assetIds: ["asset_1", "asset_1"],
      }),
    ).resolves.toBe(1);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(assetUpdate).toHaveBeenCalledWith({
      where: { id: "asset_1" },
      data: { status: "READY", deletedAt: null, purgeAfter: null },
    });
    expect(usageUpdate).toHaveBeenCalledWith({
      where: { organizationId: "org_1" },
      data: {
        readyAssetCount: { increment: 1 },
        version: { increment: 1 },
      },
    });
  });

  it("finalizes only PURGING assets and releases used storage once", async () => {
    const variantDeleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const assetUpdate = vi.fn().mockResolvedValue({});
    const usageUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      asset: {
        findFirst: vi.fn().mockResolvedValue({
          id: "asset_1",
          organizationId: "org_1",
          status: "PURGING",
          byteSize: 100n,
        }),
        update: assetUpdate,
      },
      assetVariant: {
        deleteMany: variantDeleteMany,
      },
      assetStorageUsage: {
        updateMany: usageUpdate,
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      completeAssetPurge(tx, {
        assetId: "asset_1",
        organizationId: "org_1",
      }),
    ).resolves.toBe(true);

    expect(variantDeleteMany).toHaveBeenCalledWith({
      where: { assetId: "asset_1" },
    });
    expect(assetUpdate).toHaveBeenCalledWith({
      where: { id: "asset_1" },
      data: {
        status: "PURGED",
        byteSize: 0n,
        sha256: null,
        purgeAfter: null,
      },
    });
    expect(usageUpdate).toHaveBeenCalledWith({
      where: { organizationId: "org_1" },
      data: {
        usedBytes: { decrement: 100n },
        version: { increment: 1 },
      },
    });
  });
});
