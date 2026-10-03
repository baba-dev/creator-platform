import { z } from "zod";

export const assistantMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  idempotencyKey: z.string().uuid(),
  autoVoice: z.boolean().default(false),
});

export const assistantReminderCreateSchema = z.object({
  message: z.string().trim().min(1).max(500),
  remindAt: z
    .string()
    .datetime()
    .refine(
      (val) => new Date(val).getTime() > Date.now(),
      "Reminder must be in the future.",
    ),
});

export const assistantSupportSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(5).max(5000),
  idempotencyKey: z.string().uuid(),
});

export const assistantSettingUpdateSchema = z.object({
  providerModelRecordId: z.string().trim().min(1).max(191),
  pricingMode: z.enum(["FREE", "CHARGED"]),
  systemPromptOverride: z.string().trim().max(10000).nullable().optional(),
  enabled: z.boolean().optional(),
});
