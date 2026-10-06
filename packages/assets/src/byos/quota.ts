import { z } from "zod";
import type { StorageQuota } from "../storage";

export const byteValue = z
  .union([
    z.string().regex(/^\d+$/),
    z.number().int().nonnegative().refine(Number.isSafeInteger),
  ])
  .transform((value) => BigInt(value));

export function quotaFromBytes(
  total: bigint | undefined,
  used: bigint,
  remaining?: bigint,
): StorageQuota {
  return {
    totalBytes: total?.toString() ?? null,
    usedBytes: used.toString(),
    availableBytes:
      remaining?.toString() ??
      (total === undefined
        ? null
        : (total > used ? total - used : 0n).toString()),
  };
}
