import { createHash } from "node:crypto";

export function deterministicUuid(value: string): string {
  const digest = createHash("sha256").update(value).digest("hex");
  const variantNibble = (
    (Number.parseInt(digest[16]!, 16) & 0x3) |
    0x8
  ).toString(16);
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `5${digest.slice(13, 16)}`,
    `${variantNibble}${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join("-");
}
