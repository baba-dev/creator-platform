import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    account: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    session: {
      deleteMany: vi.fn(),
    },
    auditEvent: {
      create: vi.fn(),
    },
  };

  return {
    tx,
    db: { $transaction: vi.fn() },
    hashPassword: vi.fn(),
    enqueueMail: vi.fn(),
    securityEventEmail: vi.fn(),
  };
});

vi.mock("@aiwa/db", () => ({ db: mocks.db }));
vi.mock("better-auth/crypto", () => ({
  hashPassword: mocks.hashPassword,
}));
vi.mock("@aiwa/mail", () => ({
  enqueueMail: mocks.enqueueMail,
  securityEventEmail: mocks.securityEventEmail,
}));

import {
  createAdminManagedUser,
  resetAdminManagedUserPassword,
} from "./admin-user-credentials";

describe("admin user credential service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.db.$transaction.mockImplementation(
      async (callback: (tx: typeof mocks.tx) => unknown) => callback(mocks.tx),
    );
    mocks.hashPassword.mockResolvedValue("hashed-value");
    mocks.tx.$queryRaw.mockResolvedValue([]);
    mocks.tx.session.deleteMany.mockResolvedValue({ count: 2 });
    mocks.tx.auditEvent.create.mockResolvedValue({});
    mocks.enqueueMail.mockResolvedValue({ id: "mail-1", created: true });
    mocks.securityEventEmail.mockReturnValue({ kind: "SECURITY" });
  });

  it("does not let platform admins create privileged platform accounts", async () => {
    await expect(
      createAdminManagedUser({
        actor: { userId: "admin-1", platformRole: "PLATFORM_ADMIN" },
        name: "Support",
        email: "support@example.test",
        password: "ExamplePassword123!",
        role: "SUPPORT",
        emailVerified: false,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mocks.hashPassword).not.toHaveBeenCalled();
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("does not let non-owners bypass email verification", async () => {
    await expect(
      createAdminManagedUser({
        actor: { userId: "admin-1", platformRole: "PLATFORM_ADMIN" },
        name: "User",
        email: "user@example.test",
        password: "ExamplePassword123!",
        role: "USER",
        emailVerified: true,
        verificationReason: "Mailbox checked",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mocks.hashPassword).not.toHaveBeenCalled();
  });

  it("does not let platform admins reset privileged account credentials", async () => {
    mocks.tx.user.findUnique.mockResolvedValue({
      id: "cm123456789012345678901234",
      email: "owner@example.test",
      platformRole: "PLATFORM_OWNER",
    });

    await expect(
      resetAdminManagedUserPassword({
        actor: { userId: "admin-1", platformRole: "PLATFORM_ADMIN" },
        targetUserId: "cm123456789012345678901234",
        password: "ExamplePassword123!",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mocks.tx.account.update).not.toHaveBeenCalled();
    expect(mocks.tx.session.deleteMany).not.toHaveBeenCalled();
  });

  it("updates the credential, revokes sessions, audits, and enqueues security mail", async () => {
    mocks.tx.user.findUnique.mockResolvedValue({
      id: "cm123456789012345678901234",
      email: "user@example.test",
      platformRole: "USER",
    });
    mocks.tx.account.findFirst.mockResolvedValue({ id: "account-1" });
    mocks.tx.account.update.mockResolvedValue({
      id: "account-1",
      updatedAt: new Date("2026-10-01T05:00:00.000Z"),
    });

    const result = await resetAdminManagedUserPassword({
      actor: { userId: "admin-1", platformRole: "PLATFORM_ADMIN" },
      targetUserId: "cm123456789012345678901234",
      password: "ExamplePassword123!",
    });

    expect(result.revokedSessions).toBe(2);
    expect(mocks.tx.account.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { password: "hashed-value" },
      }),
    );
    expect(mocks.tx.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: "cm123456789012345678901234" },
    });
    expect(mocks.tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "user.password_reset_by_admin",
        }),
      }),
    );
    expect(mocks.enqueueMail).toHaveBeenCalledWith(
      expect.any(Object),
      mocks.tx,
    );
  });
});
