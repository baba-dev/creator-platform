import { hasPlatformPermission, type PlatformRole } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { enqueueMail, securityEventEmail } from "@aiwa/mail";
import { hashPassword } from "better-auth/crypto";

export type AdminUserCredentialActor = {
  userId: string;
  platformRole: PlatformRole;
};

export class AdminUserCredentialError extends Error {
  constructor(
    public readonly code: "FORBIDDEN" | "USER_NOT_FOUND" | "EMAIL_EXISTS",
    message: string,
  ) {
    super(message);
    this.name = "AdminUserCredentialError";
  }
}

function assertCanManageUsers(actor: AdminUserCredentialActor): void {
  if (!hasPlatformPermission(actor.platformRole, "users:manage")) {
    throw new AdminUserCredentialError(
      "FORBIDDEN",
      "You do not have permission to manage users.",
    );
  }
}

function assertCanCreateRole(
  actor: AdminUserCredentialActor,
  role: PlatformRole,
): void {
  if (role !== "USER" && actor.platformRole !== "PLATFORM_OWNER") {
    throw new AdminUserCredentialError(
      "FORBIDDEN",
      "Only a Platform Owner may create privileged platform accounts.",
    );
  }
}

function assertCanPreverifyEmail(
  actor: AdminUserCredentialActor,
  emailVerified: boolean,
  verificationReason?: string,
): void {
  if (!emailVerified) return;
  if (actor.platformRole !== "PLATFORM_OWNER") {
    throw new AdminUserCredentialError(
      "FORBIDDEN",
      "Only a Platform Owner may administratively verify an email address.",
    );
  }
  if (!verificationReason || verificationReason.trim().length < 8) {
    throw new AdminUserCredentialError(
      "FORBIDDEN",
      "Administrative email verification requires an audit reason.",
    );
  }
}

function assertCanResetTargetPassword(
  actor: AdminUserCredentialActor,
  targetRole: PlatformRole,
): void {
  if (targetRole !== "USER" && actor.platformRole !== "PLATFORM_OWNER") {
    throw new AdminUserCredentialError(
      "FORBIDDEN",
      "Only a Platform Owner may reset the password of a privileged platform account.",
    );
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function createAdminManagedUser(input: {
  actor: AdminUserCredentialActor;
  name: string;
  email: string;
  password: string;
  role: PlatformRole;
  emailVerified: boolean;
  verificationReason?: string;
}) {
  assertCanManageUsers(input.actor);
  assertCanCreateRole(input.actor, input.role);
  assertCanPreverifyEmail(
    input.actor,
    input.emailVerified,
    input.verificationReason,
  );

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();

  const existingUser = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existingUser) {
    throw new AdminUserCredentialError(
      "EMAIL_EXISTS",
      "A user with this email address already exists.",
    );
  }

  const passwordHash = await hashPassword(input.password);

  try {
    return await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          platformRole: input.role,
          emailVerified: input.emailVerified,
        },
        select: {
          id: true,
          name: true,
          email: true,
          platformRole: true,
          emailVerified: true,
          createdAt: true,
        },
      });

      await tx.account.create({
        data: {
          accountId: user.id,
          providerId: "credential",
          userId: user.id,
          password: passwordHash,
        },
      });

      await tx.auditEvent.create({
        data: {
          actorUserId: input.actor.userId,
          action: "user.created_by_admin",
          targetType: "User",
          targetId: user.id,
          metadata: {
            email: user.email,
            platformRole: user.platformRole,
            emailVerified: user.emailVerified,
            verificationReason: input.emailVerified
              ? input.verificationReason?.trim()
              : null,
            authenticationMethod: "credential",
          },
        },
      });

      return user;
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AdminUserCredentialError(
        "EMAIL_EXISTS",
        "A user with this email address already exists.",
      );
    }
    throw error;
  }
}

export async function resetAdminManagedUserPassword(input: {
  actor: AdminUserCredentialActor;
  targetUserId: string;
  password: string;
}) {
  assertCanManageUsers(input.actor);

  const preflightUser = await db.user.findUnique({
    where: { id: input.targetUserId },
    select: { id: true, platformRole: true },
  });
  if (!preflightUser) {
    throw new AdminUserCredentialError("USER_NOT_FOUND", "User not found.");
  }
  assertCanResetTargetPassword(input.actor, preflightUser.platformRole);

  const passwordHash = await hashPassword(input.password);

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${input.targetUserId} FOR UPDATE`;

    const user = await tx.user.findUnique({
      where: { id: input.targetUserId },
      select: {
        id: true,
        email: true,
        platformRole: true,
      },
    });
    if (!user) {
      throw new AdminUserCredentialError(
        "USER_NOT_FOUND",
        "User not found.",
      );
    }

    assertCanResetTargetPassword(input.actor, user.platformRole);

    const existingAccount = await tx.account.findFirst({
      where: {
        userId: user.id,
        providerId: "credential",
      },
      select: { id: true },
    });

    const credentialAccount = existingAccount
      ? await tx.account.update({
          where: { id: existingAccount.id },
          data: { password: passwordHash },
          select: { id: true, updatedAt: true },
        })
      : await tx.account.create({
          data: {
            accountId: user.id,
            providerId: "credential",
            userId: user.id,
            password: passwordHash,
          },
          select: { id: true, updatedAt: true },
        });

    const revokedSessions = await tx.session.deleteMany({
      where: { userId: user.id },
    });

    const auditEvent = await tx.auditEvent.create({
      data: {
        actorUserId: input.actor.userId,
        action: "user.password_reset_by_admin",
        targetType: "User",
        targetId: user.id,
        metadata: {
          revokedSessions: revokedSessions.count,
          credentialAccountCreated: !existingAccount,
          credentialVersion: credentialAccount.updatedAt.toISOString(),
        },
      },
      select: { id: true },
    });

    await enqueueMail(
      securityEventEmail({
        to: user.email,
        userId: user.id,
        event: "PASSWORD_RESET",
        idempotencyKey: `security:admin-password-reset:${auditEvent.id}`,
      }),
      tx,
    );

    return {
      userId: user.id,
      revokedSessions: revokedSessions.count,
    };
  });
}
