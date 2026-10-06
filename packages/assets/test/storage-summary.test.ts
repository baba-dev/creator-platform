import type { PrismaClient } from "@aiwa/db";
import { describe, expect, it, vi } from "vitest";
import { getUserStorageSummary } from "../src/storage-summary";

it("scopes pool usage to the session user, includes variants, and caps availability by shared reservations", async () => {
  const originalGroup = vi.fn().mockResolvedValue([
    { storageProvider: "LOCAL", _sum: { byteSize: 10n } },
    { storageProvider: "GOOGLE_DRIVE", _sum: { byteSize: 100n } },
  ]);
  const variantGroup = vi
    .fn()
    .mockResolvedValue([{ storageProvider: "LOCAL", _sum: { byteSize: 5n } }]);
  const assetAggregate = vi
    .fn()
    .mockImplementation(
      async ({
        where,
      }: {
        where: { storageOwnerUserId?: string; status: unknown };
      }) => ({
        _sum: {
          byteSize:
            where.status === "PENDING"
              ? 20n
              : where.storageOwnerUserId
                ? 110n
                : 10_737_418_200n,
        },
      }),
    );
  const db = {
    asset: { groupBy: originalGroup, aggregate: assetAggregate },
    assetVariant: {
      groupBy: variantGroup,
      aggregate: vi.fn().mockResolvedValue({ _sum: { byteSize: 5n } }),
    },
    externalStorageConfig: { findMany: vi.fn().mockResolvedValue([]) },
  } as unknown as PrismaClient;
  const summary = await getUserStorageSummary(db, "org", "user", {
    storageRoot: "/tmp",
  });
  expect(originalGroup.mock.calls[0]?.[0].where).toMatchObject({
    organizationId: "org",
    storageOwnerUserId: "user",
    status: { in: ["READY", "QUARANTINED", "DELETED", "PURGING"] },
  });
  expect(variantGroup.mock.calls[0]?.[0].where.asset.storageOwnerUserId).toBe(
    "user",
  );
  expect(summary.pools[0]).toMatchObject({
    yourUsedBytes: "15",
    quota: { usedBytes: "115", availableBytes: "15" },
  });
  expect(summary.pools[1]).toMatchObject({
    yourUsedBytes: "100",
    status: "disconnected",
    quota: null,
  });
  expect(summary.reservedBytes).toBe("20");
});

describe("quota privacy", () => {
  it("does not return credentials in summaries", async () => {
    const db = {
      asset: {
        groupBy: vi.fn().mockResolvedValue([]),
        aggregate: vi.fn().mockResolvedValue({ _sum: { byteSize: 0n } }),
      },
      assetVariant: {
        groupBy: vi.fn().mockResolvedValue([]),
        aggregate: vi.fn().mockResolvedValue({ _sum: { byteSize: 0n } }),
      },
      externalStorageConfig: {
        findMany: vi.fn().mockResolvedValue([
          {
            provider: "GOOGLE_DRIVE",
            status: "ERROR",
            encryptedRefreshToken: "secret",
          },
        ]),
      },
    } as unknown as PrismaClient;
    const summary = await getUserStorageSummary(db, "org", "user", {
      storageRoot: "/tmp",
    });
    expect(JSON.stringify(summary)).not.toContain("secret");
    expect(summary.pools[1]?.status).toBe("reconnect");
  });
});
