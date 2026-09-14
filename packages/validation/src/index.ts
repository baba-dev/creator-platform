import { z } from "zod";

export const cuidSchema = z.string().min(20).max(40);
export const idempotencyKeySchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);
export const positiveCreditsSchema = z.bigint().positive();
export const nonNegativeCreditsSchema = z.bigint().nonnegative();
export const omrBaisaSchema = z.bigint().positive();

export const paginationSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const generationRequestEnvelopeSchema = z.object({
  organizationId: cuidSchema,
  projectId: cuidSchema.optional(),
  modelId: cuidSchema,
  idempotencyKey: idempotencyKeySchema,
  input: z.record(z.string(), z.unknown()),
});
