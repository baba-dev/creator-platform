import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueueMailMock = vi.fn().mockResolvedValue({ id: "mail1", created: true });
const teamMemberAddedEmailMock = vi.fn((input) => ({
  kind: "SECURITY",
  template: "organization.member_added.v1",
  to: input.to,
  subject: "member added",
  text: "member added",
  html: "<p>member added</p>",
  organizationId: input.organizationId,
  userId: input.userId,
  idempotencyKey: `membership-added:${input.membershipId}`,
}));

vi.mock("@aiwa/mail", () => ({
  enqueueMail: enqueueMailMock,
  teamMemberAddedEmail: teamMemberAddedEmailMock,
}));
import {
  addMember,
  acceptOrganizationInvitation,
  setUserEmailVerified,
  UserEmailUnverifiedError,
  InvitationEmailUnverifiedError,
  PermissionDeniedError,
} from "../src/index";

const mockTx = {
  $queryRaw: vi.fn().mockResolvedValue([]),
  organization: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  membership: {
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
  },
  organizationInvitation: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  auditEvent: {
    create: vi.fn(),
  },
  session: {
    updateMany: vi.fn(),
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

describe("email verification enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("addMember", () => {
    it("rejects adding a member by email when the account has emailVerified: false", async () => {
      mockTx.organization.findUnique.mockResolvedValue({
        id: "org1",
        status: "ACTIVE",
        ownerUserId: "owner1",
        name: "Test Organization",
      });
      mockTx.user.findUnique.mockResolvedValue({
        id: "user1",
        emailVerified: false,
        disabledAt: null,
      });

      await expect(
        addMember({
          actor: {
            userId: "owner1",
            platformRole: "USER",
            organizationId: "org1",
            organizationRole: "ORGANIZATION_OWNER",
          },
          organizationId: "org1",
          email: "unverified@example.com",
          role: "ORGANIZATION_MEMBER",
        }),
      ).rejects.toThrow(UserEmailUnverifiedError);

      expect(mockTx.membership.create).not.toHaveBeenCalled();
    });

    it("allows adding a member by email when the account has emailVerified: true", async () => {
      mockTx.organization.findUnique.mockResolvedValue({
        id: "org1",
        status: "ACTIVE",
        ownerUserId: "owner1",
      });
      mockTx.user.findUnique.mockResolvedValue({
        id: "user2",
        email: "verified@example.com",
        emailVerified: true,
        disabledAt: null,
      });
      mockTx.membership.findUnique.mockResolvedValue(null);
      mockTx.membership.count.mockResolvedValue(2);
      mockTx.membership.create.mockResolvedValue({
        id: "mem1",
        organizationId: "org1",
        userId: "user2",
        role: "ORGANIZATION_MEMBER",
      });

      const member = await addMember({
        actor: {
          userId: "owner1",
          platformRole: "USER",
          organizationId: "org1",
          organizationRole: "ORGANIZATION_OWNER",
        },
        organizationId: "org1",
        email: "verified@example.com",
        role: "ORGANIZATION_MEMBER",
      });

      expect(member.id).toBe("mem1");
      expect(mockTx.membership.create).toHaveBeenCalled();
      expect(mockTx.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "organization.member_added",
          }),
        }),
      );
      expect(teamMemberAddedEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "verified@example.com",
          organizationName: "Test Organization",
          membershipId: "mem1",
        }),
      );
      expect(enqueueMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: "membership-added:mem1",
        }),
        mockTx,
      );
    });
  });

  describe("acceptOrganizationInvitation", () => {
    it("rejects acceptance of an email-restricted invitation when user email is unverified", async () => {
      mockTx.user.findUnique.mockResolvedValue({
        id: "user1",
        email: "invitee@example.com",
        emailVerified: false,
        disabledAt: null,
      });
      mockTx.organizationInvitation.findUnique.mockResolvedValue({
        id: "inv1",
        token: "tok1",
        email: "invitee@example.com",
        role: "ORGANIZATION_MEMBER",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 100_000),
        organizationId: "org1",
        organization: { id: "org1", status: "ACTIVE" },
      });

      await expect(
        acceptOrganizationInvitation({
          actorUserId: "user1",
          token: "tok1",
        }),
      ).rejects.toThrow(InvitationEmailUnverifiedError);

      expect(mockTx.membership.create).not.toHaveBeenCalled();
    });

    it("permits acceptance of an email-restricted invitation when user email is verified", async () => {
      mockTx.user.findUnique.mockResolvedValue({
        id: "user1",
        email: "invitee@example.com",
        emailVerified: true,
        disabledAt: null,
      });
      mockTx.organizationInvitation.findUnique.mockResolvedValue({
        id: "inv1",
        token: "tok1",
        email: "invitee@example.com",
        role: "ORGANIZATION_MEMBER",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 100_000),
        organizationId: "org1",
        organization: { id: "org1", status: "ACTIVE" },
      });
      mockTx.organization.findUnique.mockResolvedValue({
        id: "org1",
        status: "ACTIVE",
        ownerUserId: "owner1",
      });
      mockTx.membership.findUnique.mockResolvedValue(null);
      mockTx.membership.count.mockResolvedValue(1);
      mockTx.membership.create.mockResolvedValue({
        id: "mem2",
        organizationId: "org1",
        userId: "user1",
        role: "ORGANIZATION_MEMBER",
      });

      const result = await acceptOrganizationInvitation({
        actorUserId: "user1",
        token: "tok1",
      });

      expect(result.membership.id).toBe("mem2");
      expect(mockTx.organizationInvitation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "ACCEPTED" }),
        }),
      );
    });
  });

  describe("setUserEmailVerified", () => {
    it("updates emailVerified and records audit event when called by authorized user", async () => {
      mockTx.user.findUnique.mockResolvedValue({
        id: "user3",
        email: "user3@example.com",
        emailVerified: false,
      });
      mockTx.user.update.mockResolvedValue({
        id: "user3",
        email: "user3@example.com",
        emailVerified: true,
      });

      const updated = await setUserEmailVerified({
        actor: { userId: "owner1", platformRole: "PLATFORM_OWNER" },
        targetUserId: "user3",
        verified: true,
        reason: "Verified through documented support escalation.",
      });

      expect(updated.emailVerified).toBe(true);
      expect(mockTx.user.update).toHaveBeenCalledWith({
        where: { id: "user3" },
        data: { emailVerified: true },
      });
      expect(mockTx.auditEvent.create).toHaveBeenCalledWith({
        data: {
          actorUserId: "owner1",
          action: "user.email_verified",
          targetType: "User",
          targetId: "user3",
          metadata: {
            email: "user3@example.com",
            previousEmailVerified: false,
            newEmailVerified: true,
            reason: "Verified through documented support escalation.",
            verificationSource: "platform_owner_attestation",
          },
        },
      });
    });

    it("rejects unauthorized actors", async () => {
      await expect(
        setUserEmailVerified({
          actor: { userId: "user1", platformRole: "USER" },
          targetUserId: "user3",
          verified: true,
        }),
      ).rejects.toThrow(PermissionDeniedError);
    });
  });
});
