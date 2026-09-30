import type { Prisma } from "@aiwa/db";
import { describe, expect, it, vi } from "vitest";

import {
  failPendingUpload,
  finalizeUploadedAsset,
} from "../src/library";

describe("uploaded asset lifecycle", () => {
  it("does not release storage when cleanup observes a published asset", async () => {
    const assetUpdate = vi.fn();
    const usageUpdate = vi.fn();
    const queryRaw = vi.fn().mockResolvedValue([]);
    const tx = {
      $queryRaw: queryRaw,
      asset: {
        findFirst: vi.fn().mockResolvedValue({
          id: "asset_ready",
          organizationId: "org_1",
          status: "READY",
          byteSize: 80n,
        }),
        update: assetUpdate,
      },
      assetStorageUsage: {
        upsert: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        update: usageUpdate,
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      failPendingUpload(tx, {
        assetId: "asset_ready",
        organizationId: "org_1",
      }),
    ).resolves.toBe(false);

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(usageUpdate).not.toHaveBeenCalled();
    expect(assetUpdate).not.toHaveBeenCalled();
  });

  it("releases the locked pending asset's exact reservation", async () => {
    const usageUpdate = vi.fn().mockResolvedValue({});
    const assetUpdate = vi.fn().mockResolvedValue({});
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      asset: {
        findFirst: vi.fn().mockResolvedValue({
          id: "asset_pending",
          organizationId: "org_1",
          status: "PENDING",
          byteSize: 73n,
        }),
        update: assetUpdate,
      },
      assetStorageUsage: {
        upsert: vi.fn().mockResolvedValue({}),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          reservedBytes: 500n,
        }),
        update: usageUpdate,
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      failPendingUpload(tx, {
        assetId: "asset_pending",
        organizationId: "org_1",
      }),
    ).resolves.toBe(true);

    expect(usageUpdate).toHaveBeenCalledWith({
      where: { organizationId: "org_1" },
      data: {
        reservedBytes: { decrement: 73n },
        version: { increment: 1 },
      },
    });
    expect(assetUpdate).toHaveBeenCalledWith({
      where: { id: "asset_pending" },
      data: {
        status: "DELETED",
        byteSize: 0n,
        deletedAt: expect.any(Date),
        purgeAfter: expect.any(Date),
      },
    });
  });

  it("finalizes storage and audit metadata in one transaction helper", async () => {
    const usageUpdate = vi.fn().mockResolvedValue({});
    const auditCreate = vi.fn().mockResolvedValue({});
    const readyAsset = {
      id: "asset_pending",
      organizationId: "org_1",
      status: "READY",
      mediaKind: "IMAGE",
      byteSize: 100n,
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      asset: {
        findFirst: vi.fn().mockResolvedValue({
          id: "asset_pending",
          organizationId: "org_1",
          status: "PENDING",
          byteSize: 120n,
        }),
        update: vi.fn().mockResolvedValue(readyAsset),
      },
      assetStorageUsage: {
        upsert: vi.fn().mockResolvedValue({}),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          reservedBytes: 500n,
        }),
        update: usageUpdate,
      },
      auditEvent: {
        create: auditCreate,
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      finalizeUploadedAsset(tx, {
        assetId: "asset_pending",
        organizationId: "org_1",
        actorUserId: "user_1",
        actualBytes: 100n,
        sha256: "a".repeat(64),
      }),
    ).resolves.toEqual(readyAsset);

    expect(usageUpdate).toHaveBeenCalledWith({
      where: { organizationId: "org_1" },
      data: {
        reservedBytes: { decrement: 120n },
        usedBytes: { increment: 100n },
        readyAssetCount: { increment: 1 },
        version: { increment: 1 },
      },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        actorUserId: "user_1",
        organizationId: "org_1",
        action: "asset.uploaded",
        targetType: "Asset",
        targetId: "asset_pending",
        metadata: {
          mediaKind: "IMAGE",
          byteSize: "100",
        },
      },
    });
  });

  it("fails finalization when the audit write fails", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      asset: {
        findFirst: vi.fn().mockResolvedValue({
          id: "asset_pending",
          organizationId: "org_1",
          status: "PENDING",
          byteSize: 120n,
        }),
        update: vi.fn().mockResolvedValue({
          id: "asset_pending",
          status: "READY",
          mediaKind: "IMAGE",
          byteSize: 100n,
        }),
      },
      assetStorageUsage: {
        upsert: vi.fn().mockResolvedValue({}),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          reservedBytes: 500n,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      auditEvent: {
        create: vi.fn().mockRejectedValue(new Error("audit unavailable")),
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      finalizeUploadedAsset(tx, {
        assetId: "asset_pending",
        organizationId: "org_1",
        actorUserId: "user_1",
        actualBytes: 100n,
        sha256: "a".repeat(64),
      }),
    ).rejects.toThrow("audit unavailable");
  });
});
