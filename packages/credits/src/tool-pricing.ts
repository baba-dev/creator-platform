import {
  calculateBillableUnits,
  createCreditQuote,
  type CreditQuote,
  type ExchangeRateSnapshot,
} from "./pricing";

export type ProviderToolPricingMetric =
  "REQUEST" | "INPUT_SECOND" | "OUTPUT_SECOND" | "INPUT_BYTE";

export interface ProviderToolPriceInput {
  readonly providerCostMicroUsd: bigint;
  readonly proportional?: boolean;
  readonly billableQuantityDenominator?: bigint;
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
  const denominator = input.billableQuantityDenominator ?? 1n;
  if (denominator < 1n || (!input.proportional && denominator !== 1n)) {
    throw new RangeError("Fractional usage requires proportional pricing");
  }
  if (quantity <= 0n) {
    throw new RangeError("billableQuantity must be greater than zero");
  }
  if (unitQuantity <= 0n) {
    throw new RangeError("unitQuantity must be greater than zero");
  }
  if (
    input.pricingMetric === "REQUEST" &&
    (quantity !== 1n || unitQuantity !== 1n || denominator !== 1n)
  ) {
    throw new RangeError(
      "REQUEST-priced tools require quantity and unitQuantity of 1",
    );
  }

  const billableUnits = calculateBillableUnits(
    quantity,
    unitQuantity * denominator,
  );
  const quote = createCreditQuote({
    providerCostMicroUsd: input.proportional
      ? (input.providerCostMicroUsd * quantity +
          unitQuantity * denominator -
          1n) /
        (unitQuantity * denominator)
      : input.providerCostMicroUsd * billableUnits,
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

export function mediaToolResolutionRate(
  rates: unknown,
  resolution: unknown,
): bigint | null {
  if (
    !rates ||
    typeof rates !== "object" ||
    Array.isArray(rates) ||
    typeof resolution !== "string"
  )
    return null;
  const aliases: Record<string, number> = { "2k": 1440, "4k": 2160 };
  const label = resolution.trim().toLowerCase();
  const shortSide =
    aliases[label] ?? (/^\d+p$/.test(label) ? Number(label.slice(0, -1)) : 0);
  if (!shortSide) return null;
  const entries = Object.entries(rates as Record<string, unknown>)
    .filter(
      ([key, rate]) =>
        /^\d+p$/.test(key) &&
        typeof rate === "string" &&
        /^[1-9]\d*$/.test(rate),
    )
    .sort(
      ([left], [right]) =>
        Number(left.slice(0, -1)) - Number(right.slice(0, -1)),
    );
  const tier = entries.find(([key]) => Number(key.slice(0, -1)) >= shortSide);
  return tier ? BigInt(tier[1] as string) : null;
}
