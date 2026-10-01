import type { Prisma } from "@aiwa/db";
import { describe, expect, it, vi } from "vitest";

import {
  AssetQuotaExceededError,
  commitAssetVariantStorage,
} from "../src/service";

function mockTx(input: {
  usedBytes: bigint;
  reservedBytes: bigint;
  memberAssetBytes: bigint;
  memberVariantBytes: bigint;
  memberPendingBytes: bigint;
}) {
  const usageUpdate = vi.fn().mockResolvedValue({});
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    assetStorageUsage: {
      upsert: vi.fn().mockResolvedValue({}),
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        usedBytes: input.usedBytes,
        reservedBytes: input.reservedBytes,
      }),
      update: usageUpdate,
    },
    asset: {
      aggregate: vi.fn(async ({ where }: { where: { status: unknown } }) => ({
        _sum: {
          byteSize:
            where.status === "PENDING"
              ? input.memberPendingBytes
              : input.memberAssetBytes,
        },
      })),
    },
    assetVariant: {
      aggregate: vi.fn().mockResolvedValue({
        _sum: { byteSize: input.memberVariantBytes },
      }),
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, usageUpdate };
}

describe("asset variant storage accounting", () => {
  it("commits derivative bytes through the locked usage cache", async () => {
    const { tx, usageUpdate } = mockTx({
      usedBytes: 900n,
      reservedBytes: 0n,
      memberAssetBytes: 850n,
      memberVariantBytes: 50n,
      memberPendingBytes: 0n,
    });

    await expect(
      commitAssetVariantStorage(tx, {
        organizationId: "org_1",
        userId: "user_1",
        byteSize: 40n,
        memberQuotaBytes: 1_000n,
        organizationQuotaBytes: 1_000n,
      }),
    ).resolves.toBeUndefined();

    expect(usageUpdate).toHaveBeenCalledWith({
      where: { organizationId: "org_1" },
      data: {
        usedBytes: { increment: 40n },
        version: { increment: 1 },
      },
    });
  });

  it("rejects a derivative that would exceed physical quota", async () => {
    const { tx, usageUpdate } = mockTx({
      usedBytes: 950n,
      reservedBytes: 0n,
      memberAssetBytes: 900n,
      memberVariantBytes: 50n,
      memberPendingBytes: 0n,
    });

    await expect(
      commitAssetVariantStorage(tx, {
        organizationId: "org_1",
        userId: "user_1",
        byteSize: 60n,
        memberQuotaBytes: 1_000n,
        organizationQuotaBytes: 1_000n,
      }),
    ).rejects.toBeInstanceOf(AssetQuotaExceededError);

    expect(usageUpdate).not.toHaveBeenCalled();
  });
});
