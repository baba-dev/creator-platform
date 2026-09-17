const KIB = 1_024n;
const UNITS = ["bytes", "KiB", "MiB", "GiB", "TiB"] as const;

/** Formats integer bytes without converting quota arithmetic to floating point. */
export function formatBinaryBytes(bytes: bigint): string {
  if (bytes < 0n) throw new RangeError("Bytes cannot be negative.");
  let unit = 0;
  let divisor = 1n;
  while (unit < UNITS.length - 1 && bytes >= divisor * KIB) {
    divisor *= KIB;
    unit += 1;
  }
  if (unit === 0) return `${bytes.toLocaleString("en-US")} ${UNITS[unit]}`;
  const tenths = (bytes * 10n + divisor / 2n) / divisor;
  return `${tenths / 10n}.${tenths % 10n} ${UNITS[unit]}`;
}
