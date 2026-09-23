import { platformRoles } from "@aiwa/authz";
import { parseServerEnv } from "@aiwa/config";
import { db } from "@aiwa/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { twoFactor } from "better-auth/plugins";

const env = parseServerEnv();

async function deliverVerificationEmail(input: {
  email: string;
  verificationUrl: string;
}): Promise<void> {
  if (!env.AUTH_EMAIL_WEBHOOK_URL) {
    if (env.NODE_ENV !== "production") {
      console.info(
        `[EmailVerification] Verification link for ${input.email}: ${input.verificationUrl}`,
      );
      return;
    }
    throw new Error(
      "Authentication email delivery is not configured. Set AUTH_EMAIL_WEBHOOK_URL.",
    );
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (env.AUTH_EMAIL_WEBHOOK_BEARER_TOKEN) {
    headers.authorization = `Bearer ${env.AUTH_EMAIL_WEBHOOK_BEARER_TOKEN}`;
  }

  const response = await fetch(env.AUTH_EMAIL_WEBHOOK_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      type: "email_verification",
      to: input.email,
      from: env.AUTH_EMAIL_FROM ?? "Aiwa Creators",
      subject: "Verify your Aiwa Creators email",
      text: `Verify your email address to activate workspace access: ${input.verificationUrl}`,
      verificationUrl: input.verificationUrl,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Authentication email delivery failed with status ${response.status}.`,
    );
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
