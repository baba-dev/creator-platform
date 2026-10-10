/**
 * Customer retail equivalent for informational use in cost previews.
 * The returned microUSD amount is NOT the provider purchase cost: it reverses
 * the quote's FX snapshot from the rounded, customer-facing OMR amount.
 * Keep the authoritative charge in integer baisa/credits in the ledger.
 */
export function retailMicroUsdApprox(
  customerPriceBaisa: bigint,
  baisaNumerator: bigint,
  baisaDenominator: bigint,
): string {
  if (customerPriceBaisa < 0n || baisaNumerator <= 0n || baisaDenominator <= 0n) {
    throw new RangeError("Invalid retail FX quote.");
  }
  const numerator = customerPriceBaisa * 1_000_000n * baisaDenominator;
  return ((numerator + baisaNumerator / 2n) / baisaNumerator).toString();
}

export function publicCostBreakdown(
  estimateBaisa: bigint,
  reservationBaisa: bigint,
  fx: { baisaNumerator: bigint; baisaDenominator: bigint },
) {
  if (reservationBaisa < estimateBaisa)
    throw new RangeError("Reservation cannot be below the estimate.");
  return {
    estimatedRetailMicroUsdApprox: retailMicroUsdApprox(
      estimateBaisa,
      fx.baisaNumerator,
      fx.baisaDenominator,
    ),
    maximumRetailMicroUsdApprox: retailMicroUsdApprox(
      reservationBaisa,
      fx.baisaNumerator,
      fx.baisaDenominator,
    ),
    fxBaisaNumerator: fx.baisaNumerator.toString(),
    fxBaisaDenominator: fx.baisaDenominator.toString(),
  };
}
