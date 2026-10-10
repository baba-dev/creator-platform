import type { Prisma } from "@aiwa/db";
import { describe, expect, it, vi } from "vitest";
import { trashAssets, restoreAssets, assignAssets } from "../src/library";

describe("Private Reference Mutation Authorization", () => {
  it("trashAssets filters by reference owner when userId is provided", async () => {
    const updateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const mockTx = {
      asset: {
        updateMany: updateManyMock,
      },
      assetStorageUsage: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as Prisma.TransactionClient;

    const count = await trashAssets(mockTx, {
      organizationId: "org-1",
      assetIds: ["asset-ref-1"],
      userId: "user-owner",
    });

    expect(count).toBe(1);
    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          learnMedia: { is: null },
          id: { in: ["asset-ref-1"] },
          organizationId: "org-1",
          status: "READY",
          OR: [
            { purpose: "GENERAL" },
            { purpose: "REFERENCE_INPUT", storageOwnerUserId: "user-owner" },
          ],
        },
      }),
    );
  });

  it("restoreAssets skips REFERENCE_INPUT not owned by userId", async () => {
    const updateMock = vi.fn();
    const mockTx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      asset: {
        findFirst: vi.fn().mockResolvedValue({
          id: "asset-ref-1",
          status: "DELETED",
          purpose: "REFERENCE_INPUT",
          storageOwnerUserId: "other-user",
        }),
        update: updateMock,
      },
      assetStorageUsage: {
        updateMany: vi.fn(),
      },
    } as unknown as Prisma.TransactionClient;

    const restored = await restoreAssets(mockTx, {
      organizationId: "org-1",
      assetIds: ["asset-ref-1"],
      userId: "user-attacker",
    });

    expect(restored).toBe(0);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("assignAssets filters by reference owner when userId is provided", async () => {
    const updateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const mockTx = {
      project: {
        findFirst: vi.fn().mockResolvedValue({ id: "proj-1" }),
      },
      asset: {
        updateMany: updateManyMock,
      },
    } as unknown as Prisma.TransactionClient;

    const count = await assignAssets(mockTx, {
      organizationId: "org-1",
      assetIds: ["asset-ref-1"],
      projectId: "proj-1",
      userId: "user-owner",
    });

    expect(count).toBe(1);
    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          learnMedia: { is: null },
          id: { in: ["asset-ref-1"] },
          organizationId: "org-1",
          status: { in: ["READY", "DELETED"] },
          OR: [
            { purpose: "GENERAL" },
            { purpose: "REFERENCE_INPUT", storageOwnerUserId: "user-owner" },
          ],
        },
      }),
    );
  });
});
