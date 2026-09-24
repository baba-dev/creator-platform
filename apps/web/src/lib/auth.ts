import { createHash } from "node:crypto";
import { platformRoles } from "@aiwa/authz";
import { parseServerEnv } from "@aiwa/config";
import { db } from "@aiwa/db";
import { enqueueMail, verificationEmail } from "@aiwa/mail";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { twoFactor } from "better-auth/plugins";

const env = parseServerEnv();

async function deliverVerificationEmail(input: {
  email: string;
  verificationUrl: string;
  userId?: string;
}): Promise<void> {
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
}

export const auth = betterAuth({
  appName: "Aiwa Creators",
  baseURL: env.APP_URL,
  secret: env.AUTH_SECRET,
  database: prismaAdapter(db, {
    provider: "mysql",
    transaction: true,
  }),
  plugins: [
    twoFactor({
      issuer: "Aiwa Creators",
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
  },
  account: {
    accountLinking: {
      enabled: false,
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
    },
  },
  advanced: {
    cookiePrefix: "aiwa-creators",
    useSecureCookies: env.NODE_ENV === "production",
    database: {
      validateSchema: true,
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const user = await db.user.findUnique({
            where: { id: session.userId },
            select: { disabledAt: true },
          });

          return user?.disabledAt ? false : undefined;
        },
      },
    },
  },
});

export type AuthSession = typeof auth.$Infer.Session;
