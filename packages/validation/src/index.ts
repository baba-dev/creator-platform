import { z } from "zod";

export const cuidSchema = z
  .string()
  .min(20)
  .max(40)
  .regex(/^[a-z0-9]+$/);
export const idempotencyKeySchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);
export const positiveCreditsSchema = z.bigint().positive();
export const nonNegativeCreditsSchema = z.bigint().nonnegative();
export const omrBaisaSchema = z.bigint().positive();

export const paginationSchema = z.object({
  cursor: cuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const organizationNameSchema = z.string().trim().min(2).max(80);
export const organizationStatusFilterSchema = z.enum([
  "all",
  "active",
  "suspended",
]);
export const organizationSearchSchema = paginationSchema.extend({
  search: z.string().trim().max(120).default(""),
  status: organizationStatusFilterSchema.default("all"),
});
export const managedMembershipRoleSchema = z.enum([
  "ORGANIZATION_MEMBER",
  "ORGANIZATION_VIEWER",
]);
const MAX_SIGNED_BIGINT = 9_223_372_036_854_775_807n;
export const monthlyCreditCapSchema = z.union([
  z.bigint().nonnegative().max(MAX_SIGNED_BIGINT),
  z
    .string()
    .regex(/^\d+$/)
    .transform((value, context) => {
      const parsed = BigInt(value);
      if (parsed > MAX_SIGNED_BIGINT) {
        context.addIssue({
          code: "custom",
          message: "Credit cap is too large.",
        });
        return z.NEVER;
      }
      return parsed;
    }),
  z.null(),
]);
export const addOrganizationMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: managedMembershipRoleSchema.default("ORGANIZATION_MEMBER"),
  monthlySpendingCapCredits: monthlyCreditCapSchema.optional(),
});
export const changeMembershipRoleSchema = z.object({
  membershipId: cuidSchema,
  role: managedMembershipRoleSchema,
});
export const changeMonthlyCreditCapSchema = z.object({
  membershipId: cuidSchema,
  monthlySpendingCapCredits: monthlyCreditCapSchema,
});
export const removeMemberSchema = z.object({ membershipId: cuidSchema });
export const transferOwnershipSchema = z.object({
  targetMembershipId: cuidSchema,
});
export const renameOrganizationSchema = z.object({
  name: organizationNameSchema,
});
export const organizationStatusMutationSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

export const organizationOnboardingSchema = z.object({
  name: organizationNameSchema,
});

export const activateOrganizationSchema = z.object({
  organizationId: cuidSchema,
});

export const platformRoleSchema = z.enum([
  "USER",
  "SUPPORT",
  "OPERATOR",
  "FINANCE_ADMIN",
  "PLATFORM_ADMIN",
  "PLATFORM_OWNER",
]);

export const userStatusFilterSchema = z.enum(["all", "active", "disabled"]);
export const userPlatformRoleFilterSchema = z.enum([
  "all",
  "USER",
  "SUPPORT",
  "OPERATOR",
  "FINANCE_ADMIN",
  "PLATFORM_ADMIN",
  "PLATFORM_OWNER",
]);
export const userSearchSchema = paginationSchema.extend({
  search: z.string().trim().max(120).default(""),
  status: userStatusFilterSchema.default("all"),
  role: userPlatformRoleFilterSchema.default("all"),
});

export const changePlatformRoleSchema = z.object({
  role: platformRoleSchema,
});

export const userAccessMutationSchema = z.object({
  disabled: z.boolean(),
});

export const attachUserMembershipSchema = z.object({
  organizationId: cuidSchema,
  role: managedMembershipRoleSchema.default("ORGANIZATION_MEMBER"),
  monthlySpendingCapCredits: monthlyCreditCapSchema.optional(),
});

export const createInvitationSchema = z.object({
  role: managedMembershipRoleSchema.default("ORGANIZATION_MEMBER"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .max(254)
    .optional()
    .or(z.literal("")),
  expiresInDays: z.coerce.number().int().min(1).max(30).default(7),
});

export const acceptInvitationSchema = z.object({
  token: z.string().trim().min(16).max(128),
});

export const revokeInvitationSchema = z.object({
  invitationId: cuidSchema,
});

export const generationRequestEnvelopeSchema = z.object({
  organizationId: cuidSchema,
  projectId: cuidSchema.optional(),
  modelId: cuidSchema,
  idempotencyKey: idempotencyKeySchema,
  input: z.record(z.string(), z.unknown()),
});

export const toggleModelEnabledSchema = z.object({
  enabled: z.boolean(),
});

export const publishPriceVersionSchema = z.object({
  providerCostMicroUsd: z.union([
    z.bigint().positive(),
    z.string().regex(/^\d+$/).transform(BigInt),
  ]),
  targetMarginBps: z.number().int().min(0).max(9999),
  fxBaisaNumerator: z
    .union([z.bigint().positive(), z.string().regex(/^\d+$/).transform(BigInt)])
    .optional(),
  fxBaisaDenominator: z
    .union([z.bigint().positive(), z.string().regex(/^\d+$/).transform(BigInt)])
    .optional(),
  creditsPerBaisa: z
    .union([z.bigint().positive(), z.string().regex(/^\d+$/).transform(BigInt)])
    .optional(),
});

export const quoteRequestSchema = z.object({
  organizationId: cuidSchema,
  modelId: z.string().trim().min(1).max(128),
  units: z.coerce.number().int().positive().default(1),
});
