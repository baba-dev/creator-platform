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
export const MAX_SIGNED_BIGINT = 9_223_372_036_854_775_807n;
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
  pricingDimension: z.enum(["REQUEST", "CHARACTER"]).optional(),
  unitQuantity: z.coerce.number().int().positive().optional(),
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
  billableQuantity: z.coerce
    .number()
    .int()
    .nonnegative()
    .max(1_000_000)
    .optional(),
  text: z.string().max(4096).optional(),
});

export const paymentMethodSchema = z.enum(["CASH", "CHEQUE"]);
export const paymentStatusSchema = z.enum([
  "DRAFT",
  "PENDING",
  "CONFIRMED",
  "REJECTED",
  "REVERSED",
]);
export const ledgerEntryTypeSchema = z.enum([
  "PAYMENT_GRANT",
  "ADMIN_GRANT",
  "RESERVATION",
  "CAPTURE",
  "RELEASE",
  "REFUND",
  "ADJUSTMENT",
  "REVERSAL",
]);

const positiveDatabaseBigIntSchema = z
  .union([
    z.bigint(),
    z
      .string()
      .trim()
      .min(1)
      .max(19)
      .regex(/^[1-9]\d*$/)
      .transform(BigInt),
  ])
  .pipe(z.bigint().positive().max(MAX_SIGNED_BIGINT));

export const recordPaymentSchema = z
  .object({
    method: paymentMethodSchema,
    amountBaisa: positiveDatabaseBigIntSchema,
    receivedAt: z.coerce.date(),
    reference: z.string().trim().max(128).optional(),
    chequeNumber: z.string().trim().max(64).optional(),
    bankName: z.string().trim().max(128).optional(),
    notes: z.string().trim().max(2000).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .superRefine((value, context) => {
    if (value.method === "CHEQUE") {
      if (!value.chequeNumber) {
        context.addIssue({
          code: "custom",
          path: ["chequeNumber"],
          message: "Cheque number is required for cheque payments.",
        });
      }
      if (!value.bankName) {
        context.addIssue({
          code: "custom",
          path: ["bankName"],
          message: "Bank name is required for cheque payments.",
        });
      }
    }
  });

export const confirmPaymentSchema = z.object({
  creditsPerBaisa: positiveDatabaseBigIntSchema.default(1n),
  idempotencyKey: idempotencyKeySchema,
});

export const rejectPaymentSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: idempotencyKeySchema,
});

export const reversePaymentSchema = z.object({
  reason: z.string().trim().min(5).max(500),
  idempotencyKey: idempotencyKeySchema,
});

export const paymentActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm") }).merge(confirmPaymentSchema),
  z.object({ action: z.literal("reject") }).merge(rejectPaymentSchema),
  z.object({ action: z.literal("reverse") }).merge(reversePaymentSchema),
]);

export const grantAdminCreditsSchema = z.object({
  amountCredits: positiveDatabaseBigIntSchema,
  reason: z.string().trim().min(5).max(500),
  idempotencyKey: idempotencyKeySchema,
});

export const paymentListQuerySchema = z.object({
  cursor: cuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: paymentStatusSchema.optional(),
  method: paymentMethodSchema.optional(),
});

const exportDateRangeSchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .superRefine((value, context) => {
    if (value.from && value.to && value.from > value.to) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "The end date must be on or after the start date.",
      });
    }
  });

export const paymentExportQuerySchema = exportDateRangeSchema.and(
  z.object({
    status: paymentStatusSchema.optional(),
    method: paymentMethodSchema.optional(),
  }),
);

export const ledgerExportQuerySchema = exportDateRangeSchema.and(
  z.object({
    type: ledgerEntryTypeSchema.optional(),
  }),
);

export const reconcileJobOutcomeSchema = z.object({
  outcome: z.enum(["SUCCEEDED", "FAILED", "NOT_SUBMITTED"]),
  evidence: z.string().trim().min(5).max(1000),
  providerRequestId: z.string().trim().max(128).optional(),
  actualProviderCostMicroUsd: positiveDatabaseBigIntSchema.optional(),
  notes: z.string().trim().max(2000).optional(),
  idempotencyKey: idempotencyKeySchema,
});

export const recoverJobOutputSchema = z.object({
  outputUrl: z.string().trim().url().max(2048).optional(),
  mode: z.enum(["immediate", "resume_processing"]).default("immediate"),
  reason: z.string().trim().min(5).max(1000),
  idempotencyKey: idempotencyKeySchema,
});

export const releaseJobReservationSchema = z.object({
  reason: z.string().trim().min(5).max(1000),
  evidence: z.string().trim().min(5).max(1000),
  idempotencyKey: idempotencyKeySchema,
});

export const refundSettledJobSchema = z.object({
  amountCredits: positiveDatabaseBigIntSchema.optional(),
  reason: z.string().trim().min(5).max(1000),
  idempotencyKey: idempotencyKeySchema,
});

export const jobResolutionActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reconcile") }).merge(reconcileJobOutcomeSchema),
  z.object({ action: z.literal("recover") }).merge(recoverJobOutputSchema),
  z.object({ action: z.literal("release") }).merge(releaseJobReservationSchema),
  z.object({ action: z.literal("refund") }).merge(refundSettledJobSchema),
]);
