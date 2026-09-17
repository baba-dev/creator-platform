import { z } from "zod";

const firstValue = (value: unknown) =>
  Array.isArray(value) ? value[0] : value;

export const adminListFiltersSchema = z.object({
  page: z
    .preprocess(
      firstValue,
      z.coerce.number().int().positive().max(10_000).catch(1),
    )
    .default(1),
  search: z
    .preprocess(firstValue, z.string().trim().max(100).catch(""))
    .default(""),
  status: z
    .preprocess(
      firstValue,
      z
        .string()
        .trim()
        .max(32)
        .regex(/^[A-Z_]*$/)
        .catch(""),
    )
    .default(""),
});

export type AdminListFilters = z.infer<typeof adminListFiltersSchema>;

export function parseAdminListFilters(
  input: Record<string, string | string[] | undefined>,
): AdminListFilters {
  return adminListFiltersSchema.parse(input);
}
