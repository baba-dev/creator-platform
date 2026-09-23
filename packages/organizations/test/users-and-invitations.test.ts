import { describe, expect, it } from "vitest";
import {
  CannotDisableSelfError,
  InvitationAlreadyAcceptedError,
  InvitationEmailMismatchError,
  InvitationExpiredError,
  InvitationNotFoundError,
  InvitationRevokedError,
  InvitationEmailUnverifiedError,
  MAX_ORGANIZATION_NON_OWNER_MEMBERS,
  MAX_ORGANIZATION_SEATS,
  PermissionDeniedError,
  SolePlatformOwnerError,
  UserEmailUnverifiedError,
  UserNotFoundError,
  generateInvitationToken,
  setUserDisabled,
  setUserEmailVerified,
  setUserPlatformRole,
} from "../src/index";

describe("users and invitations domain", () => {
  it("enforces seat constants", () => {
    expect(MAX_ORGANIZATION_NON_OWNER_MEMBERS).toBe(9);
    expect(MAX_ORGANIZATION_SEATS).toBe(10);
  });

  it("generates 48-character hex invitation tokens", () => {
    const token1 = generateInvitationToken();
    const token2 = generateInvitationToken();
    expect(token1).toHaveLength(48);
    expect(token2).toHaveLength(48);
    expect(token1).not.toBe(token2);
    expect(/^[0-9a-f]{48}$/.test(token1)).toBe(true);
  });

  it("instantiates domain errors with correct codes and messages", () => {
    expect(new UserNotFoundError().code).toBe("USER_NOT_FOUND");
    expect(new CannotDisableSelfError().code).toBe("CANNOT_DISABLE_SELF");
    expect(new SolePlatformOwnerError().code).toBe("SOLE_PLATFORM_OWNER");
    expect(new InvitationNotFoundError().code).toBe("INVITATION_NOT_FOUND");
    expect(new InvitationExpiredError().code).toBe("INVITATION_EXPIRED");
    expect(new InvitationRevokedError().code).toBe("INVITATION_REVOKED");
    expect(new InvitationAlreadyAcceptedError().code).toBe(
      "INVITATION_ALREADY_ACCEPTED",
    );
    const mismatch = new InvitationEmailMismatchError("test@example.com");
    expect(mismatch.code).toBe("INVITATION_EMAIL_MISMATCH");
    expect(mismatch.message).toContain("test@example.com");
    const unverifiedUser = new UserEmailUnverifiedError();
    expect(unverifiedUser.code).toBe("USER_EMAIL_UNVERIFIED");
    const unverifiedInvite = new InvitationEmailUnverifiedError(
      "test@example.com",
    );
    expect(unverifiedInvite.code).toBe("INVITATION_EMAIL_UNVERIFIED");
    expect(unverifiedInvite.message).toContain("test@example.com");
  });

  it("restricts setUserPlatformRole to PLATFORM_OWNER actor", async () => {
    await expect(
      setUserPlatformRole({
        actor: { userId: "admin1", platformRole: "PLATFORM_ADMIN" },
        targetUserId: "user1",
        role: "SUPPORT",
      }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it("prevents actor from disabling their own account", async () => {
    await expect(
      setUserDisabled({
        actor: { userId: "user1", platformRole: "PLATFORM_OWNER" },
        targetUserId: "user1",
        disabled: true,
      }),
    ).rejects.toThrow(CannotDisableSelfError);
  });

  it("rejects setUserDisabled from actors without users:manage permission", async () => {
    await expect(
      setUserDisabled({
        actor: { userId: "support1", platformRole: "SUPPORT" },
        targetUserId: "user2",
        disabled: true,
      }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it("rejects administrative verification from non-owner actors", async () => {
    await expect(
      setUserEmailVerified({
        actor: { userId: "admin1", platformRole: "PLATFORM_ADMIN" },
        targetUserId: "user2",
        verified: true,
        reason: "Support escalation requested manual verification.",
      }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it("rejects setUserEmailVerified from actors without users:manage permission", async () => {
    await expect(
      setUserEmailVerified({
        actor: { userId: "user1", platformRole: "USER" },
        targetUserId: "user2",
        verified: true,
      }),
    ).rejects.toThrow(PermissionDeniedError);
  });
});
