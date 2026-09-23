import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SolePlatformOwnerError,
  setUserDisabled,
  setUserPlatformRole,
} from "../src/index";

const mockTx = {
  $queryRaw: vi.fn(),
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  auditEvent: {
    create: vi.fn(),
  },
  session: {
    deleteMany: vi.fn(),
  },
};

vi.mock("@aiwa/db", () => ({
  db: {
    $transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) =>
      cb(mockTx),
    ),
  },
  Prisma: {
    TransactionIsolationLevel: {
      Serializable: "Serializable",
    },
  },
}));

describe("single active platform owner concurrency protection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("prevents demoting the sole active platform owner", async () => {
    mockTx.$queryRaw.mockResolvedValue([{ id: "owner-1" }]);
    mockTx.user.findUnique.mockResolvedValue({
      id: "owner-1",
      platformRole: "PLATFORM_OWNER",
      disabledAt: null,
    });

    await expect(
      setUserPlatformRole({
        actor: { userId: "owner-1", platformRole: "PLATFORM_OWNER" },
        targetUserId: "owner-1",
        role: "PLATFORM_ADMIN",
      }),
    ).rejects.toThrow(SolePlatformOwnerError);

    expect(mockTx.$queryRaw).toHaveBeenCalled();
    expect(mockTx.user.update).not.toHaveBeenCalled();
  });

  it("prevents disabling the sole active platform owner", async () => {
    mockTx.$queryRaw.mockResolvedValue([{ id: "owner-1" }]);
    mockTx.user.findUnique.mockResolvedValue({
      id: "owner-1",
      platformRole: "PLATFORM_OWNER",
      disabledAt: null,
    });

    await expect(
      setUserDisabled({
        actor: { userId: "admin-actor", platformRole: "PLATFORM_OWNER" },
        targetUserId: "owner-1",
        disabled: true,
      }),
    ).rejects.toThrow(SolePlatformOwnerError);

    expect(mockTx.$queryRaw).toHaveBeenCalled();
    expect(mockTx.user.update).not.toHaveBeenCalled();
  });

  it("serializes concurrent demotions and preserves the single-active-owner invariant", async () => {
    // State of active platform owners in the database
    let activeOwners = ["owner-1", "owner-2"];

    // Simulated lock sequence: each transaction acquires the FOR UPDATE lock,
    // reads the latest active owners, updates the database state if successful, and commits.
    const runDemoteTx = async (targetId: string) => {
      // Step 1: row lock on target user
      mockTx.$queryRaw.mockResolvedValueOnce([{ id: targetId }]);
      mockTx.user.findUnique.mockResolvedValueOnce({
        id: targetId,
        platformRole: "PLATFORM_OWNER",
        disabledAt: null,
      });

      // Step 2: serialization lock on all active platform owners (FOR UPDATE)
      mockTx.$queryRaw.mockResolvedValueOnce(
        activeOwners.map((id) => ({ id })),
      );

      mockTx.user.update.mockImplementationOnce(async ({ where, data }) => {
        if (data.platformRole !== "PLATFORM_OWNER") {
          activeOwners = activeOwners.filter((id) => id !== where.id);
        }
        return { id: where.id, platformRole: data.platformRole };
      });

      return setUserPlatformRole({
        actor: { userId: "super-owner", platformRole: "PLATFORM_OWNER" },
        targetUserId: targetId,
        role: "PLATFORM_ADMIN",
      });
    };

    // First demotion succeeds: active owners drops from [owner-1, owner-2] to [owner-2]
    await expect(runDemoteTx("owner-1")).resolves.toMatchObject({
      id: "owner-1",
      platformRole: "PLATFORM_ADMIN",
    });

    expect(activeOwners).toEqual(["owner-2"]);

    // Second concurrent demotion targets owner-2:
    // With serialized lock, it reads active owners = [owner-2], sees 0 other owners, and is rejected!
    await expect(runDemoteTx("owner-2")).rejects.toThrow(
      SolePlatformOwnerError,
    );

    // Invariant preserved: owner-2 is still active owner!
    expect(activeOwners).toEqual(["owner-2"]);
  });

  it("serializes concurrent disabling and preserves the single-active-owner invariant", async () => {
    let activeOwners = ["owner-1", "owner-2"];

    const runDisableTx = async (targetId: string) => {
      mockTx.$queryRaw.mockResolvedValueOnce([{ id: targetId }]);
      mockTx.user.findUnique.mockResolvedValueOnce({
        id: targetId,
        platformRole: "PLATFORM_OWNER",
        disabledAt: null,
      });

      mockTx.$queryRaw.mockResolvedValueOnce(
        activeOwners.map((id) => ({ id })),
      );

      mockTx.user.update.mockImplementationOnce(async ({ where, data }) => {
        if (data.disabledAt) {
          activeOwners = activeOwners.filter((id) => id !== where.id);
        }
        return { id: where.id, disabledAt: data.disabledAt };
      });

      return setUserDisabled({
        actor: { userId: "super-owner", platformRole: "PLATFORM_OWNER" },
        targetUserId: targetId,
        disabled: true,
      });
    };

    // First disable succeeds for owner-1
    await expect(runDisableTx("owner-1")).resolves.toBeDefined();
    expect(activeOwners).toEqual(["owner-2"]);

    // Second disable for owner-2 must fail
    await expect(runDisableTx("owner-2")).rejects.toThrow(
      SolePlatformOwnerError,
    );
    expect(activeOwners).toEqual(["owner-2"]);
  });

  it("serializes mixed concurrent demotion and disable mutations", async () => {
    let activeOwners = ["owner-1", "owner-2"];

    // Tx 1 disables owner-1
    mockTx.$queryRaw.mockResolvedValueOnce([{ id: "owner-1" }]);
    mockTx.user.findUnique.mockResolvedValueOnce({
      id: "owner-1",
      platformRole: "PLATFORM_OWNER",
      disabledAt: null,
    });
    mockTx.$queryRaw.mockResolvedValueOnce([
      { id: "owner-1" },
      { id: "owner-2" },
    ]);
    mockTx.user.update.mockImplementationOnce(async ({ where, data }) => {
      activeOwners = activeOwners.filter((id) => id !== where.id);
      return { id: where.id, disabledAt: data.disabledAt };
    });

    await expect(
      setUserDisabled({
        actor: { userId: "admin-actor", platformRole: "PLATFORM_OWNER" },
        targetUserId: "owner-1",
        disabled: true,
      }),
    ).resolves.toBeDefined();
    expect(activeOwners).toEqual(["owner-2"]);

    // Tx 2 attempts to demote owner-2
    mockTx.$queryRaw.mockResolvedValueOnce([{ id: "owner-2" }]);
    mockTx.user.findUnique.mockResolvedValueOnce({
      id: "owner-2",
      platformRole: "PLATFORM_OWNER",
      disabledAt: null,
    });
    mockTx.$queryRaw.mockResolvedValueOnce(activeOwners.map((id) => ({ id })));

    await expect(
      setUserPlatformRole({
        actor: { userId: "admin-actor", platformRole: "PLATFORM_OWNER" },
        targetUserId: "owner-2",
        role: "USER",
      }),
    ).rejects.toThrow(SolePlatformOwnerError);

    expect(activeOwners).toEqual(["owner-2"]);
  });
});
