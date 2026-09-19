/**
 * Format integer baisa to standard OMR decimal string.
 * 1 OMR = 1,000 baisa.
 * Example: 1250n -> "1.250 OMR", 50n -> "0.050 OMR", 0n -> "0.000 OMR"
 */
export function formatBaisa(baisa: bigint): string {
  const isNegative = baisa < 0n;
  const absBaisa = isNegative ? -baisa : baisa;
  const omr = absBaisa / 1000n;
  const rem = absBaisa % 1000n;
  const formattedRem = rem.toString().padStart(3, "0");
  const sign = isNegative ? "-" : "";
  return `${sign}${omr.toLocaleString("en-US")}.${formattedRem} OMR`;
}

/**
 * Format integer credits with locale number formatting.
 * Example: 5000n -> "5,000", -250n -> "-250"
 */
export function formatCredits(credits: bigint): string {
  return credits.toLocaleString("en-US");
}
