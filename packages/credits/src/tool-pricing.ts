import {
  calculateBillableUnits,
  createCreditQuote,
  type CreditQuote,
  type ExchangeRateSnapshot,
} from "./pricing";

export type ProviderToolPricingMetric =
  "REQUEST" | "INPUT_SECOND" | "OUTPUT_SECOND";

export interface ProviderToolPriceInput {
  readonly providerCostMicroUsd: bigint;
  readonly pricingMetric: ProviderToolPricingMetric;
  readonly unitQuantity: number | bigint;
  readonly billableQuantity: number | bigint;
  readonly exchangeRate: ExchangeRateSnapshot;
  readonly targetGrossMarginBps: number;
  readonly creditsPerBaisa: bigint;
}

export interface ProviderToolQuote extends CreditQuote {
  readonly pricingMetric: ProviderToolPricingMetric;
  readonly billableQuantity: bigint;
  readonly billableUnits: bigint;
  readonly unitQuantity: bigint;
}

export function quoteProviderToolPrice(
  input: ProviderToolPriceInput,
): ProviderToolQuote {
  const quantity = BigInt(input.billableQuantity);
  const unitQuantity = BigInt(input.unitQuantity);
  if (quantity <= 0n) {
    throw new RangeError("billableQuantity must be greater than zero");
  }
  if (unitQuantity <= 0n) {
    throw new RangeError("unitQuantity must be greater than zero");
  }
  if (
    input.pricingMetric === "REQUEST" &&
    (quantity !== 1n || unitQuantity !== 1n)
  ) {
    throw new RangeError(
      "REQUEST-priced tools require quantity and unitQuantity of 1",
    );
  }

  const billableUnits = calculateBillableUnits(quantity, unitQuantity);
  const quote = createCreditQuote({
    providerCostMicroUsd: input.providerCostMicroUsd * billableUnits,
    exchangeRate: input.exchangeRate,
    targetGrossMarginBps: input.targetGrossMarginBps,
    creditsPerBaisa: input.creditsPerBaisa,
  });

  return {
    ...quote,
    pricingMetric: input.pricingMetric,
    billableQuantity: quantity,
    billableUnits,
    unitQuantity,
  };
}
