import type { TextUsageTier } from "@aiwa/credits";

export type AdminModelProvider =
  | "BYTEPLUS"
  | "NVIDIA"
  | "GROQ"
  | "GEMINI"
  | "CLOUDFLARE";

export function adminTextEstimatorForProvider(
  provider: AdminModelProvider,
): "byteplus-text-v1" | "text-token-v1" {
  if (provider === "BYTEPLUS") return "byteplus-text-v1";
  if (
    provider === "GROQ" ||
    provider === "GEMINI" ||
    provider === "CLOUDFLARE"
  )
    return "text-token-v1";
  throw new Error("This provider does not support token-priced text models.");
}

export function initialTextUsageTiers(
  currentUsageRates: unknown,
  fallbackCostMicroUsd: string,
): TextUsageTier[] {
  if (
    currentUsageRates &&
    typeof currentUsageRates === "object" &&
    !Array.isArray(currentUsageRates)
  ) {
    const value = currentUsageRates as {
      estimator?: unknown;
      tiers?: unknown;
    };
    if (
      (value.estimator === "byteplus-text-v1" ||
        value.estimator === "text-token-v1") &&
      Array.isArray(value.tiers)
    ) {
      return value.tiers as TextUsageTier[];
    }
  }

  const baseCost = BigInt(fallbackCostMicroUsd || "1");
  return [
    {
      maxPromptTokens: 262144,
      inputMicroUsdPerMillionTokens: String(baseCost * 1000n),
      cachedInputMicroUsdPerMillionTokens: String(baseCost * 1000n),
      outputMicroUsdPerMillionTokens: String(baseCost * 1000n),
    },
  ];
}
