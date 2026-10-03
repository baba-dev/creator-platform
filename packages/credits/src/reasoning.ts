import { textProviderCostMicroUsd } from "./usage";

export interface ReasoningPriceSnapshot {
  readonly providerCostMicroUsd: bigint;
  readonly pricingDimension: string;
  readonly usageRates?: unknown;
}

export type ReasoningProviderCostBasis =
  | "CONFIGURED_RATE"
  | "ESTIMATED_TOKENS"
  | "PROVIDER_USAGE"
  | "USAGE_UNAVAILABLE";

function estimatedTokensFromCharacters(characters: number): number {
  if (!Number.isSafeInteger(characters) || characters < 0) {
    throw new RangeError("Reasoning prompt length is invalid.");
  }
  return Math.max(1, Math.ceil(characters / 2));
}

export function estimateReasoningProviderCost(params: {
  price: ReasoningPriceSnapshot;
  promptCharacters: number;
  maximumOutputTokens?: number;
}): {
  providerCostMicroUsd: bigint;
  basis: "CONFIGURED_RATE" | "ESTIMATED_TOKENS";
  estimatedInputTokens: number | null;
  maximumOutputTokens: number | null;
} {
  if (params.price.pricingDimension === "REQUEST") {
    return {
      providerCostMicroUsd: params.price.providerCostMicroUsd,
      basis: "CONFIGURED_RATE",
      estimatedInputTokens: null,
      maximumOutputTokens: null,
    };
  }

  if (params.price.pricingDimension !== "TOKEN") {
    throw new RangeError(
      "Reasoning cost observability requires REQUEST or TOKEN pricing.",
    );
  }

  const maximumOutputTokens = params.maximumOutputTokens ?? 2048;
  if (
    !Number.isSafeInteger(maximumOutputTokens) ||
    maximumOutputTokens < 1 ||
    maximumOutputTokens > 8192
  ) {
    throw new RangeError("Reasoning output token limit is invalid.");
  }

  const estimatedInputTokens = estimatedTokensFromCharacters(
    params.promptCharacters,
  );
  return {
    providerCostMicroUsd: textProviderCostMicroUsd(params.price.usageRates, {
      promptTokens: estimatedInputTokens,
      completionTokens: maximumOutputTokens,
    }),
    basis: "ESTIMATED_TOKENS",
    estimatedInputTokens,
    maximumOutputTokens,
  };
}

export function settleReasoningProviderCost(params: {
  price: ReasoningPriceSnapshot | null | undefined;
  inputTokens?: number | null;
  outputTokens?: number | null;
}): {
  providerCostMicroUsd: bigint | null;
  basis: ReasoningProviderCostBasis | null;
} {
  const price = params.price;
  if (!price) return { providerCostMicroUsd: null, basis: null };

  if (price.pricingDimension === "REQUEST") {
    return {
      providerCostMicroUsd: price.providerCostMicroUsd,
      basis: "CONFIGURED_RATE",
    };
  }

  if (price.pricingDimension !== "TOKEN") {
    return { providerCostMicroUsd: null, basis: "USAGE_UNAVAILABLE" };
  }

  const inputTokens = params.inputTokens;
  const outputTokens = params.outputTokens;
  if (
    !Number.isSafeInteger(inputTokens) ||
    !Number.isSafeInteger(outputTokens) ||
    (inputTokens ?? -1) < 0 ||
    (outputTokens ?? -1) < 0
  ) {
    return { providerCostMicroUsd: null, basis: "USAGE_UNAVAILABLE" };
  }

  return {
    providerCostMicroUsd: textProviderCostMicroUsd(price.usageRates, {
      promptTokens: inputTokens as number,
      completionTokens: outputTokens as number,
    }),
    basis: "PROVIDER_USAGE",
  };
}
