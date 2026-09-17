import { requireNonNegativeInteger } from "@aiwa/core";

const MICRO_USD_PER_USD = 1_000_000n;
const BASIS_POINTS = 10_000n;

export interface ExchangeRateSnapshot {
  readonly baisaNumerator: bigint;
  readonly baisaDenominator: bigint;
}

export interface QuoteInput {
  readonly providerCostMicroUsd: bigint;
  readonly exchangeRate: ExchangeRateSnapshot;
  readonly targetGrossMarginBps: number;
  readonly creditsPerBaisa: bigint;
}

export interface CreditQuote {
  readonly providerCostMicroUsd: bigint;
  readonly convertedCostBaisa: bigint;
  readonly customerPriceBaisa: bigint;
  readonly customerCredits: bigint;
  readonly targetGrossMarginBps: number;
}

function divideRoundUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new RangeError("denominator must be greater than zero");
  }

  return (numerator + denominator - 1n) / denominator;
}

export function createCreditQuote(input: QuoteInput): CreditQuote {
  const providerCostMicroUsd = requireNonNegativeInteger(
    input.providerCostMicroUsd,
    "providerCostMicroUsd",
  );
  const creditsPerBaisa = requireNonNegativeInteger(
    input.creditsPerBaisa,
    "creditsPerBaisa",
  );

  if (creditsPerBaisa === 0n) {
    throw new RangeError("creditsPerBaisa must be greater than zero");
  }

  if (
    !Number.isInteger(input.targetGrossMarginBps) ||
    input.targetGrossMarginBps < 0 ||
    input.targetGrossMarginBps >= Number(BASIS_POINTS)
  ) {
    throw new RangeError(
      "targetGrossMarginBps must be an integer from 0 to 9999",
    );
  }

  const convertedCostBaisa = divideRoundUp(
    providerCostMicroUsd * input.exchangeRate.baisaNumerator,
    MICRO_USD_PER_USD * input.exchangeRate.baisaDenominator,
  );
  const customerPriceBaisa = divideRoundUp(
    convertedCostBaisa * BASIS_POINTS,
    BASIS_POINTS - BigInt(input.targetGrossMarginBps),
  );

  return {
    providerCostMicroUsd,
    convertedCostBaisa,
    customerPriceBaisa,
    customerCredits: customerPriceBaisa * creditsPerBaisa,
    targetGrossMarginBps: input.targetGrossMarginBps,
  };
}

export const DEFAULT_FX_RATE: ExchangeRateSnapshot = {
  baisaNumerator: 769n,
  baisaDenominator: 2n,
} as const;

export const DEFAULT_CREDITS_PER_BAISA = 1n;
export const DEFAULT_TARGET_MARGIN_BPS = 2_500;

export interface ModelQuoteParams {
  readonly providerCostMicroUsd: bigint;
  readonly units?: number | bigint;
  readonly exchangeRate?: ExchangeRateSnapshot;
  readonly targetGrossMarginBps?: number;
  readonly creditsPerBaisa?: bigint;
}

export function calculateModelQuote(params: ModelQuoteParams): CreditQuote {
  const rawUnits = params.units ?? 1n;
  const units = BigInt(rawUnits);
  if (units <= 0n) {
    throw new RangeError("units must be greater than zero");
  }

  const scaledCost = params.providerCostMicroUsd * units;

  return createCreditQuote({
    providerCostMicroUsd: scaledCost,
    exchangeRate: params.exchangeRate ?? DEFAULT_FX_RATE,
    targetGrossMarginBps:
      params.targetGrossMarginBps ?? DEFAULT_TARGET_MARGIN_BPS,
    creditsPerBaisa: params.creditsPerBaisa ?? DEFAULT_CREDITS_PER_BAISA,
  });
}

export * from "./ledger";
