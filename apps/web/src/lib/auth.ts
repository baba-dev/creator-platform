import { attributeLearn } from "@aiwa/learn";
import { createHash } from "node:crypto";
import { platformRoles } from "@aiwa/authz";
import { parseServerEnv } from "@aiwa/config";
import { db } from "@aiwa/db";
import {
  enqueueMail,
  passwordResetEmail,
  securityEventEmail,
  verificationEmail,
} from "@aiwa/mail";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { createAuthMiddleware } from "better-auth/api";
import { twoFactor } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { socialSignUpDisabled } from "./social-signup-policy";

const env = parseServerEnv();

async function deliverVerificationEmail(input: {
  email: string;
  verificationUrl: string;
  userId?: string;
}): Promise<void> {
  try {
    await enqueueMail(
      verificationEmail({
        to: input.email,
        verificationUrl: input.verificationUrl,
        idempotencyKey: `verify:${createHash("sha256")
          .update(input.verificationUrl)
          .digest("hex")}`,
        userId: input.userId,
      }),
    );
  } catch (error) {
    // The account may already exist. A failed outbox write is recoverable
    // through the rate-limited resend route; don't return a false signup 500.
    console.error("Verification outbox write failed", {
      userId: input.userId,
      errorName: error instanceof Error ? error.name : "Unknown",
    });
  }
}

export const auth = betterAuth({
  appName: "Aiwa Creators",
  baseURL: env.APP_URL,
  secret: env.AUTH_SECRET,
  database: prismaAdapter(db, {
    provider: "mysql",
    transaction: true,
  }),
  socialProviders: {
    ...(env.GOOGLE_AUTH_CLIENT_ID && env.GOOGLE_AUTH_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_AUTH_CLIENT_ID,
            clientSecret: env.GOOGLE_AUTH_CLIENT_SECRET,
            prompt: "select_account" as const,
            // Pausing registrations must also prevent new OAuth identities.
            // Existing linked accounts can still sign in and link explicitly.
            disableSignUp: socialSignUpDisabled(env.SIGNUPS_ENABLED),
          },
        }
      : {}),
    ...(env.MICROSOFT_AUTH_CLIENT_ID && env.MICROSOFT_AUTH_CLIENT_SECRET
      ? {
          microsoft: {
            clientId: env.MICROSOFT_AUTH_CLIENT_ID,
            clientSecret: env.MICROSOFT_AUTH_CLIENT_SECRET,
            tenantId: env.MICROSOFT_AUTH_TENANT_ID,
            prompt: "select_account" as const,
            // Pausing registrations must also prevent new OAuth identities.
            // Existing linked accounts can still sign in and link explicitly.
            disableSignUp: socialSignUpDisabled(env.SIGNUPS_ENABLED),
            mapProfileToUser: () => ({ image: "" }),
          },
        }
      : {}),
  },
  plugins: [
    passkey({
      rpID: new URL(env.APP_URL).hostname,
      rpName: "Aiwa Creators",
      origin: new URL(env.APP_URL).origin,
      authenticatorSelection: {
        userVerification: "required",
        residentKey: "preferred",
      },
    }),
    twoFactor({
      issuer: "Aiwa Creators",
      allowPasswordless: true,
    }),
  ],
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await deliverVerificationEmail({
        email: user.email,
        verificationUrl: url,
        userId: user.id,
      });
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: !env.SIGNUPS_ENABLED,
    requireEmailVerification: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    autoSignIn: false,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, url, token }) => {
      // This is a durable outbox write, not SMTP delivery. Await it so a
      // successful auth response never races ahead of the MailMessage row.
      // The public route applies a uniform response floor to preserve
      // enumeration resistance for existing vs. unknown accounts.
      try {
        await enqueueMail(
          passwordResetEmail({
            to: user.email,
            resetUrl: url,
            userId: user.id,
            idempotencyKey: `password-reset:${createHash("sha256")
              .update(token)
              .digest("hex")}`,
          }),
        );
      } catch (error) {
        console.error("Password reset mail enqueue failed.", {
          userId: user.id,
          errorName: error instanceof Error ? error.name : "UnknownError",
          errorMessage: error instanceof Error ? error.message : "Unknown",
        });
        throw error;
      }
    },
    onPasswordReset: async ({ user }) => {
      // A post-reset notification must never make an already-completed
      // password change look unsuccessful to the user.
      try {
        await enqueueMail(
          securityEventEmail({
            to: user.email,
            userId: user.id,
            event: "PASSWORD_RESET",
            idempotencyKey: `security:password-reset:${user.id}:${Date.now()}`,
          }),
        );
      } catch (error) {
        console.error("Password reset security notification enqueue failed.", {
          userId: user.id,
          errorName: error instanceof Error ? error.name : "UnknownError",
          errorMessage: error instanceof Error ? error.message : "Unknown",
        });
      }
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      // Require the existing account holder to sign in and explicitly link.
      disableImplicitLinking: true,
      // Only authenticated linking; implicit same-email merges remain disabled.
      trustedProviders: ["google", "microsoft"],
      allowUnlinkingAll: false,
      updateUserInfoOnLink: false,
    },
  },
  user: {
    additionalFields: {
      platformRole: {
        type: [...platformRoles],
        required: false,
        defaultValue: "USER",
        input: false,
      },
      disabledAt: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    freshAge: 60 * 60,
    cookieCache: {
      enabled: false,
    },
    additionalFields: {
      activeOrganizationId: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  verification: {
    storeIdentifier: "hashed",
  },
  trustedOrigins: [env.APP_URL],
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 300, max: 3 },
      "/send-verification-email": { window: 300, max: 3 },
      "/sign-in/social": { window: 60, max: 12 },
      "/sign-in/passkey": { window: 60, max: 10 },
      "/passkey/add-passkey": { window: 300, max: 5 },
    },
  },
  advanced: {
    cookiePrefix: "aiwa-creators",
    useSecureCookies: env.NODE_ENV === "production",
    database: {
      validateSchema: true,
    },
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/two-factor/generate-backup-codes") return;

      const session = ctx.context.session;
      const userId = session?.user?.id;
      if (!userId) return;

      const [user, factor] = await Promise.all([
        db.user.findUnique({
          where: { id: userId },
          select: { email: true },
        }),
        db.twoFactor.findFirst({
          where: { userId },
          orderBy: { updatedAt: "desc" },
          select: { updatedAt: true },
        }),
      ]);
      if (!user || !factor) return;

      await enqueueMail(
        securityEventEmail({
          to: user.email,
          userId,
          event: "BACKUP_CODES_REGENERATED",
          idempotencyKey: `security:backup-codes-regenerated:${userId}:${factor.updatedAt.getTime()}`,
        }),
      );
    }),
  },
  databaseHooks: {
    account: {
      create: {
        before: async (account) => ({
          // Authentication does not need persistent social OAuth tokens.
          // The separately consented storage integration encrypts its own tokens.
          data:
            account.providerId === "google" ||
            account.providerId === "microsoft"
              ? {
                  ...account,
                  accessToken: null,
                  refreshToken: null,
                  idToken: null,
                }
              : account,
        }),
      },
    },
    user: {
      create: {
        after: async (user, ctx) => {
          const target = ctx?.body?.callbackURL;
          if (typeof target !== "string") return;
          const match = /^\/learn\/start\/([a-zA-Z0-9_-]+)$/.exec(target);
          if (match?.[1])
            await attributeLearn(user.id, match[1], true).catch(
              () => undefined,
            );
        },
      },
      update: {
        after: async (updatedUser, ctx) => {
          if (
            ctx?.path !== "/two-factor/verify-totp" &&
            ctx?.path !== "/two-factor/disable"
          ) {
            return;
          }

          const user = await db.user.findUnique({
            where: { id: updatedUser.id },
            select: {
              id: true,
              email: true,
              twoFactorEnabled: true,
              updatedAt: true,
            },
          });
          if (!user) return;

          if (ctx.path === "/two-factor/verify-totp" && user.twoFactorEnabled) {
            const factor = await db.twoFactor.findFirst({
              where: { userId: user.id, verified: true },
              orderBy: { updatedAt: "desc" },
              select: { updatedAt: true },
            });
            if (!factor) return;
            await enqueueMail(
              securityEventEmail({
                to: user.email,
                userId: user.id,
                event: "MFA_ENABLED",
                idempotencyKey: `security:mfa-enabled:${user.id}:${factor.updatedAt.getTime()}`,
              }),
            );
            return;
          }

          if (ctx.path === "/two-factor/disable" && !user.twoFactorEnabled) {
            await db.session.deleteMany({
              where: { userId: user.id },
            });
            await enqueueMail(
              securityEventEmail({
                to: user.email,
                userId: user.id,
                event: "MFA_DISABLED",
                idempotencyKey: `security:mfa-disabled:${user.id}:${user.updatedAt.getTime()}`,
              }),
            );
          }
        },
      },
    },
    session: {
      create: {
        before: async (session, ctx) => {
          const user = await db.user.findUnique({
            where: { id: session.userId },
            select: { disabledAt: true, platformRole: true },
          });
          if (!user || user.disabledAt) return false;
          // Credential logins alone receive Better Auth's TOTP challenge.
          // Refuse privileged sessions created by OAuth or passkey endpoints.
          if (
            user.platformRole !== "USER" &&
            (!ctx?.path ||
              ctx.path.includes("/callback/") ||
              ctx.path.includes("/sign-in/passkey") ||
              ctx.path.includes("/passkey/verify-authentication"))
          ) {
            return false;
          }
          return undefined;
        },
      },
    },
  },
});

export type AuthSession = typeof auth.$Infer.Session;
