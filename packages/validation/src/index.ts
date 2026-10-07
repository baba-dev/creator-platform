import { z } from "zod";

export const cuidSchema = z
  .string()
  .min(20)
  .max(40)
  .regex(/^[a-z0-9]+$/);

// Better Auth owns User.id values. Existing accounts may use mixed-case
// alphanumeric IDs, while Prisma-owned records continue to use cuidSchema.
export const userRecordIdSchema = z
  .string()
  .min(20)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
// ProviderModel includes a legacy seeded NVIDIA row with a hyphenated ID.
// Admin model routes must accept both it and Prisma-generated CUIDs.
export const providerModelRecordIdSchema = z
  .string()
  .min(1)
  .max(191)
  .regex(/^[a-z0-9][a-z0-9_-]*$/);
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
  cursor: userRecordIdSchema.optional(),
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

export const adminManagedPasswordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters.")
  .max(128, "Password cannot exceed 128 characters.");

export const adminCreateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().email().max(254),
    password: adminManagedPasswordSchema,
    role: platformRoleSchema.default("USER"),
    emailVerified: z.boolean().default(false),
    verificationReason: z.string().trim().min(8).max(500).optional(),
  })
  .superRefine((value, context) => {
    if (value.emailVerified && !value.verificationReason) {
      context.addIssue({
        code: "custom",
        path: ["verificationReason"],
        message:
          "An audit reason is required when administratively verifying an email.",
      });
    }
  });

export const adminResetPasswordSchema = z.object({
  password: adminManagedPasswordSchema,
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

export const pricingDimensionSchema = z.enum([
  "REQUEST",
  "CHARACTER",
  "SECOND",
  "TOKEN",
]);
export type PricingDimension = z.infer<typeof pricingDimensionSchema>;

export const mediaKindSchema = z.enum([
  "IMAGE",
  "VIDEO",
  "VOICE",
  "REASONING",
  "TEXT",
]);
export type MediaKind = z.infer<typeof mediaKindSchema>;

export const PRICING_DIMENSIONS_BY_MEDIA_KIND: Record<
  MediaKind,
  readonly PricingDimension[]
> = {
  IMAGE: ["REQUEST"],
  VIDEO: ["SECOND", "REQUEST", "TOKEN"],
  VOICE: ["CHARACTER", "SECOND", "REQUEST"],
  REASONING: ["REQUEST", "TOKEN"],
  TEXT: ["TOKEN"],
} as const;

export function isPricingDimensionSupportedForMedia(
  mediaKind: string,
  pricingDimension: string,
): boolean {
  const supported = PRICING_DIMENSIONS_BY_MEDIA_KIND[mediaKind as MediaKind];
  if (!supported) return false;
  return supported.includes(pricingDimension as PricingDimension);
}

export function assertPricingDimensionMatchesMediaKind(
  mediaKind: string,
  pricingDimension: string,
): void {
  if (!isPricingDimensionSupportedForMedia(mediaKind, pricingDimension)) {
    const supported = PRICING_DIMENSIONS_BY_MEDIA_KIND[mediaKind as MediaKind];
    const allowed = supported ? supported.join(", ") : "none";
    throw new Error(
      `Pricing dimension '${pricingDimension}' is not supported for ${mediaKind} models. Supported dimensions: ${allowed}.`,
    );
  }
}

const positiveRateStringSchema = z
  .string()
  .regex(/^\d{1,19}$/)
  .refine((value) => BigInt(value) > 0n && BigInt(value) <= MAX_SIGNED_BIGINT);

const videoUsageRatesSchema = z
  .object({
    estimator: z.enum(["byteplus-video-v1", "byteplus-video-v2"]),
    rates: z
      .array(
        z
          .object({
            resolution: z.enum(["480p", "720p", "1080p", "4K"]),
            workflow: z.enum(["GENERATE", "VIDEO_INPUT"]),
            microUsdPerThousandTokens: positiveRateStringSchema,
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.rates.map((row) => row.resolution + ":" + row.workflow))
        .size === value.rates.length,
    "Duplicate rate selector.",
  );

const textUsageRatesSchema = z
  .object({
    estimator: z.enum(["byteplus-text-v1", "text-token-v1"]),
    tiers: z
      .array(
        z
          .object({
            maxPromptTokens: z.number().int().positive().max(1_048_576),
            inputMicroUsdPerMillionTokens: positiveRateStringSchema,
            outputMicroUsdPerMillionTokens: positiveRateStringSchema,
            cachedInputMicroUsdPerMillionTokens:
              positiveRateStringSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(4),
  })
  .strict()
  .refine(
    (value) =>
      value.tiers.every(
        (tier, index) =>
          index === 0 ||
          tier.maxPromptTokens > value.tiers[index - 1]!.maxPromptTokens,
      ),
    "Text pricing tiers must be strictly increasing.",
  );

export const usageRatesSchema = z.union([
  videoUsageRatesSchema,
  textUsageRatesSchema,
]);

export const publishPriceVersionSchema = z.object({
  idempotencyKey: z.uuid().optional(),
  usageRates: usageRatesSchema.optional(),
  providerCostBasisNote: z.string().trim().max(255).optional(),
  providerCostMicroUsd: z
    .union([z.bigint(), z.string().regex(/^\d+$/).transform(BigInt)])
    .pipe(z.bigint().positive().max(MAX_SIGNED_BIGINT)),
  videoInputRate720p: z
    .union([z.bigint(), z.string().regex(/^\d+$/).transform(BigInt)])
    .pipe(z.bigint().positive().max(MAX_SIGNED_BIGINT))
    .optional(),
  videoInputRate1080p: z
    .union([z.bigint(), z.string().regex(/^\d+$/).transform(BigInt)])
    .pipe(z.bigint().positive().max(MAX_SIGNED_BIGINT))
    .optional(),
  targetMarginBps: z.number().int().min(0).max(9999),
  pricingDimension: pricingDimensionSchema.optional(),
  unitQuantity: z.coerce.number().int().positive().optional(),
  fxBaisaNumerator: z
    .union([z.bigint(), z.string().regex(/^\d+$/).transform(BigInt)])
    .pipe(z.bigint().positive().max(MAX_SIGNED_BIGINT))
    .optional(),
  fxBaisaDenominator: z
    .union([z.bigint(), z.string().regex(/^\d+$/).transform(BigInt)])
    .pipe(z.bigint().positive().max(MAX_SIGNED_BIGINT))
    .optional(),
  creditsPerBaisa: z
    .union([z.bigint(), z.string().regex(/^\d+$/).transform(BigInt)])
    .pipe(z.bigint().positive().max(MAX_SIGNED_BIGINT))
    .optional(),
});

export const videoQuoteSourceSchema = z
  .object({
    assetId: cuidSchema,
    role: z.enum([
      "FIRST_FRAME",
      "LAST_FRAME",
      "REFERENCE_IMAGE",
      "REFERENCE_VIDEO",
      "REFERENCE_AUDIO",
      "SOURCE_VIDEO",
      "AVATAR_IMAGE",
      "DRIVING_AUDIO",
    ]),
    position: z.number().int().min(0).max(49),
  })
  .strict();

export const quoteRequestSchema = z
  .object({
    organizationId: cuidSchema,
    modelId: z.string().trim().min(1).max(128),
    units: z.coerce.number().int().positive().max(8_192).default(1),
    billableQuantity: z.coerce
      .number()
      .int()
      .nonnegative()
      .max(1_000_000)
      .optional(),
    text: z.string().max(120_000).optional(),
    schemaVersion: z.literal(2).optional(),
    workflow: z
      .enum([
        "GENERATE",
        "FRAME_TO_VIDEO",
        "FIRST_LAST_FRAME",
        "REFERENCE",
        "EDIT",
        "EXTEND",
        "DRAFT",
        "DRAFT_FINAL",
        "TALKING_AVATAR",
      ])
      .optional(),
    sources: z.array(videoQuoteSourceSchema).max(50).optional(),
    durationSeconds: z.coerce.number().int().min(-1).max(30).optional(),
    aspectRatio: z
      .enum([
        "1:1",
        "16:9",
        "9:16",
        "4:3",
        "3:4",
        "3:2",
        "2:3",
        "21:9",
        "adaptive",
      ])
      .optional(),
    referenceAssetIds: z.array(cuidSchema).max(14).default([]),
    firstFrameAssetId: cuidSchema.optional(),
    lastFrameAssetId: cuidSchema.optional(),
    resolution: z
      .enum(["480p", "720p", "1080p", "1K", "1.5K", "2K", "3K", "4K"])
      .optional(),
    generateAudio: z.boolean().optional(),
    referenceVideoAssetId: cuidSchema.optional(),
    outputFormat: z.enum(["mp4", "mov"]).optional(),
    returnLastFrame: z.boolean().optional(),
    seed: z.coerce.number().int().min(-1).max(2_147_483_647).optional(),
    sourceDraftJobId: cuidSchema.optional(),
    extensionDirection: z.enum(["BEFORE", "AFTER"]).optional(),
  })
  .superRefine((value, context) => {
    const sources = value.sources ?? [];
    if (
      new Set(sources.map((source) => source.assetId)).size !== sources.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["sources"],
        message: "Video source assets must be unique.",
      });
    }
    if (
      new Set(sources.map((source) => source.position)).size !== sources.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["sources"],
        message: "Video source positions must be unique.",
      });
    }
    if (value.schemaVersion === 2 && !value.workflow) {
      context.addIssue({
        code: "custom",
        path: ["workflow"],
        message: "Video V2 quotes require a workflow.",
      });
    }
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
  outcome: z.enum(["SUCCEEDED", "FAILED", "CANCELLED", "NOT_SUBMITTED"]),
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

export const templateVariableTypeSchema = z.enum([
  "text",
  "textarea",
  "select",
  "toggle",
  "number",
  "reference-image",
]);

export const templateVariableDefinitionSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-zA-Z0-9_]{0,39}$/),
    label: z.string().trim().min(1).max(80),
    type: templateVariableTypeSchema,
    required: z.boolean().default(false),
    placeholder: z.string().trim().max(160).optional(),
    helpText: z.string().trim().max(240).optional(),
    options: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
    defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.type === "select" &&
      (!value.options || value.options.length === 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "Select variables require at least one option.",
      });
    }
  });

export const templateDefaultInputSchema = z
  .object({
    aspectRatio: z.string().trim().max(20).optional(),
    resolution: z.string().trim().max(20).optional(),
    outputCount: z.number().int().min(1).max(15).optional(),
    durationSeconds: z.number().int().min(1).max(30).optional(),
    generateAudio: z.boolean().optional(),
    voiceKey: z.string().trim().max(100).optional(),
    speechRate: z.number().min(0.5).max(2).optional(),
  })
  .strict();

export const createTemplateSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().min(10).max(800),
    category: z.string().trim().min(2).max(40),
    mediaKind: z.enum(["IMAGE", "VIDEO", "VOICE"]),
    promptTemplate: z.string().trim().min(3).max(4000),
    variables: z.array(templateVariableDefinitionSchema).max(20),
    defaultInput: templateDefaultInputSchema,
    preferredModelId: z.string().trim().max(128).nullable().optional(),
    featured: z.boolean().default(false),
    sortOrder: z.number().int().min(-10000).max(10000).default(0),
    status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
  })
  .strict();

export const updateTemplateSchema = createTemplateSchema.partial().strict();

export const resolveTemplateSchema = z
  .object({
    organizationId: cuidSchema,
    values: z.record(
      z.string(),
      z.union([z.string().max(2000), z.number(), z.boolean()]),
    ),
  })
  .strict();

export const templateListQuerySchema = z.object({
  organizationId: cuidSchema,
  q: z.string().trim().max(120).default(""),
  mediaKind: z.enum(["IMAGE", "VIDEO", "VOICE"]).optional(),
  category: z.string().trim().max(40).optional(),
  favorites: z.coerce.boolean().optional(),
});

export const personaCreateSchema = z
  .object({
    organizationId: cuidSchema,
    name: z.string().trim().min(2).max(100),
    avatarUrl: z.string().trim().url().max(2048).optional(),
    tag: z.string().trim().max(50).optional(),
    description: z.string().trim().max(1000).optional(),
    systemPrompt: z.string().trim().min(5).max(10000),
    voiceKey: z.string().trim().max(100).optional(),
    modelId: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .default("doubao-seed-character-260628"),
  })
  .strict();

export const personaUpdateSchema = personaCreateSchema
  .partial()
  .omit({ organizationId: true });

export const chatThreadCreateSchema = z
  .object({
    organizationId: cuidSchema,
    projectId: cuidSchema.optional(),
    personaId: cuidSchema.optional(),
    title: z.string().trim().min(1).max(200).default("New Conversation"),
    modelId: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .default("doubao-seed-character-260628"),
    systemPrompt: z.string().trim().max(10000).optional(),
  })
  .strict();

export const chatMessageCreateSchema = z
  .object({
    content: z.string().trim().min(1).max(8000),
    idempotencyKey: z.uuid(),
    autoVoice: z.boolean().default(false),
  })
  .strict();

const scriptSceneSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    type: z.enum(["slugline", "action", "dialogue"]),
    character: z.string().trim().max(100).optional(),
    parenthetical: z.string().trim().max(200).optional(),
    text: z.string().trim().min(1).max(8000),
    audioJobId: cuidSchema.optional(),
    voiceKey: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

const scriptContentSchema = z
  .object({
    scenes: z.array(scriptSceneSchema).max(500),
    voiceAssignments: z
      .record(
        z.string().trim().min(1).max(100),
        z
          .object({
            voiceKey: z.string().trim().min(1).max(100),
            speechRate: z.number().min(0.5).max(2).optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export const scriptCreateSchema = z
  .object({
    organizationId: cuidSchema,
    projectId: cuidSchema.optional(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(1000).optional(),
    logline: z.string().trim().max(500).optional(),
    targetDurationSeconds: z.number().int().positive().max(3600).optional(),
    content: scriptContentSchema,
  })
  .strict();

export const scriptUpdateSchema = scriptCreateSchema
  .partial()
  .omit({ organizationId: true })
  .extend({
    expectedRevision: z.number().int().positive(),
  })
  .strict();

export const brandProfileCreateSchema = z
  .object({
    organizationId: cuidSchema,
    name: z.string().trim().min(2).max(100),
    tagline: z.string().trim().max(200).optional(),
    voiceTone: z.string().trim().max(1000).optional(),
    guidelines: z.string().trim().max(5000).optional(),
    targetAudience: z.string().trim().max(1000).optional(),
    vocabulary: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  })
  .strict();

export const brandProfileUpdateSchema = brandProfileCreateSchema
  .partial()
  .omit({ organizationId: true });

export const storyStructureTypeSchema = z.enum([
  "THREE_ACT",
  "FIVE_ACT",
  "HERO_JOURNEY",
  "SAVE_THE_CAT",
]);

const storyBeatSchema = z
  .object({
    act: z.string().trim().min(1).max(200),
    beat: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(4000),
    conflict: z.string().trim().max(2000).default(""),
  })
  .strict();

const storyCharacterSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    role: z.string().trim().max(160).default(""),
    motivation: z.string().trim().max(2000).default(""),
    flaw: z.string().trim().max(2000).default(""),
  })
  .strict();

export const storyPlanCreateSchema = z
  .object({
    organizationId: cuidSchema,
    projectId: cuidSchema.optional(),
    title: z.string().trim().min(1).max(200),
    genre: z.string().trim().max(100).optional(),
    premise: z.string().trim().max(2000).optional(),
    structureType: storyStructureTypeSchema.default("THREE_ACT"),
    beats: z.array(storyBeatSchema).max(100).default([]),
    characters: z.array(storyCharacterSchema).max(100).default([]),
  })
  .strict();

export const storyPlanUpdateSchema = storyPlanCreateSchema
  .partial()
  .omit({ organizationId: true });

export const providerToolRecordIdSchema = z
  .string()
  .min(1)
  .max(191)
  .regex(/^[a-z0-9][a-z0-9_-]*$/);

export const toggleProviderToolEnabledSchema = z
  .object({ enabled: z.boolean() })
  .strict();

export const publishProviderToolPriceVersionSchema = z
  .object({
    idempotencyKey: z.uuid(),
    providerCostMicroUsd: positiveDatabaseBigIntSchema,
    providerCostNoOutputMicroUsd: positiveDatabaseBigIntSchema.optional(),
    targetMarginBps: z.number().int().min(0).max(9999),
    unitQuantity: z.coerce.number().int().positive().max(86_400).default(1),
    fxBaisaNumerator: positiveDatabaseBigIntSchema.optional(),
    fxBaisaDenominator: positiveDatabaseBigIntSchema.optional(),
    creditsPerBaisa: positiveDatabaseBigIntSchema.optional(),
    providerCostBasisNote: z.string().trim().max(255).optional(),
  })
  .strict();
