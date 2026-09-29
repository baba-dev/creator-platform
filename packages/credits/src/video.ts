import { requireNonNegativeInteger } from "@aiwa/core";
import {
  createCreditQuote,
  DEFAULT_CREDITS_PER_BAISA,
  DEFAULT_FX_RATE,
  DEFAULT_TARGET_MARGIN_BPS,
  type CreditQuote,
  type ExchangeRateSnapshot,
  calculateBillableUnits,
} from "./index";

const BASIS_POINTS = 10_000n;

function divideRoundUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new RangeError("denominator must be greater than zero");
  }
  return (numerator + denominator - 1n) / denominator;
}

export const VIDEO_RESOLUTION_MULTIPLIERS_BPS: Readonly<
  Record<string, bigint>
> = {
  "480p": 7_500n,
  "720p": 10_000n,
  "1080p": 15_000n,
  "2K": 17_500n,
  "4K": 25_000n,
};

export const VIDEO_AUDIO_MULTIPLIER_BPS: bigint = 12_000n;
export const VIDEO_BASELINE_MULTIPLIER_BPS: bigint = 10_000n;

export interface VideoPricingParams {
  readonly providerCostMicroUsd: bigint;
  readonly durationSeconds: number;
  readonly resolution?: string;
  readonly generateAudio?: boolean;
  readonly pricingDimension?: "SECOND" | "REQUEST" | string;
  readonly unitQuantity?: number | bigint;
  readonly exchangeRate?: ExchangeRateSnapshot;
  readonly targetGrossMarginBps?: number;
  readonly creditsPerBaisa?: bigint;
}

export interface VideoPricingResult {
  readonly billableQuantity: number;
  readonly durationUnits: bigint;
  readonly resolutionBps: bigint;
  readonly audioBps: bigint;
  readonly scaledProviderCostMicroUsd: bigint;
  readonly quote: CreditQuote;
}

export function getResolutionMultiplierBps(resolution?: string): bigint {
  if (!resolution) return VIDEO_BASELINE_MULTIPLIER_BPS;
  return (
    VIDEO_RESOLUTION_MULTIPLIERS_BPS[resolution] ??
    VIDEO_BASELINE_MULTIPLIER_BPS
  );
}

export function getAudioMultiplierBps(generateAudio?: boolean): bigint {
  return generateAudio
    ? VIDEO_AUDIO_MULTIPLIER_BPS
    : VIDEO_BASELINE_MULTIPLIER_BPS;
}

export function calculateVideoPricing(
  params: VideoPricingParams,
): VideoPricingResult {
  const providerCostMicroUsd = requireNonNegativeInteger(
    params.providerCostMicroUsd,
    "providerCostMicroUsd",
  );

  const durationSeconds = params.durationSeconds;
  if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) {
    throw new RangeError(
      "durationSeconds must be an integer greater than zero",
    );
  }

  const pricingDimension = params.pricingDimension ?? "SECOND";
  if (pricingDimension !== "SECOND" && pricingDimension !== "REQUEST") {
    throw new RangeError(
      `Unsupported video pricing dimension: ${pricingDimension}. Expected SECOND or REQUEST.`,
    );
  }
  const unitQuantity = params.unitQuantity ? BigInt(params.unitQuantity) : 5n;
  if (unitQuantity <= 0n) {
    throw new RangeError("unitQuantity must be greater than zero");
  }

  const durationUnits =
    pricingDimension === "SECOND"
      ? calculateBillableUnits(BigInt(durationSeconds), unitQuantity)
      : 1n;

  const resolutionBps =
    pricingDimension === "SECOND"
      ? getResolutionMultiplierBps(params.resolution)
      : VIDEO_BASELINE_MULTIPLIER_BPS;

  const audioBps =
    pricingDimension === "SECOND"
      ? getAudioMultiplierBps(params.generateAudio)
      : VIDEO_BASELINE_MULTIPLIER_BPS;

  const baseCost = providerCostMicroUsd * durationUnits;
  const costWithResolution = divideRoundUp(
    baseCost * resolutionBps,
    BASIS_POINTS,
  );
  const scaledProviderCostMicroUsd = divideRoundUp(
    costWithResolution * audioBps,
    BASIS_POINTS,
  );

  const quote = createCreditQuote({
    providerCostMicroUsd: scaledProviderCostMicroUsd,
    exchangeRate: params.exchangeRate ?? DEFAULT_FX_RATE,
    targetGrossMarginBps:
      params.targetGrossMarginBps ?? DEFAULT_TARGET_MARGIN_BPS,
    creditsPerBaisa: params.creditsPerBaisa ?? DEFAULT_CREDITS_PER_BAISA,
  });

  return {
    billableQuantity: durationSeconds,
    durationUnits,
    resolutionBps,
    audioBps,
    scaledProviderCostMicroUsd,
    quote,
  };
}

/** BytePlus video-input rates are micro-USD per 1,000 completion tokens. */
export function videoInputProviderCost(
  completionTokens: bigint,
  rateMicroUsdPerThousandTokens: bigint,
): bigint {
  requireNonNegativeInteger(completionTokens, "completionTokens");
  requireNonNegativeInteger(
    rateMicroUsdPerThousandTokens,
    "rateMicroUsdPerThousandTokens",
  );
  if (rateMicroUsdPerThousandTokens === 0n)
    throw new RangeError("video-input token rate must be positive");
  return divideRoundUp(
    completionTokens * rateMicroUsdPerThousandTokens,
    1_000n,
  );
}

/** Conservative 2.5:1 envelope; actual billed tokens come from provider usage. */
export function estimateVideoInputTokens(
  inputDurationMs: number,
  outputDurationSeconds: number,
  resolution: "720p" | "1080p",
): bigint {
  if (
    !Number.isSafeInteger(inputDurationMs) ||
    inputDurationMs < 2_000 ||
    inputDurationMs > 30_000 ||
    !Number.isSafeInteger(outputDurationSeconds) ||
    outputDurationSeconds < 4 ||
    outputDurationSeconds > 30
  )
    throw new RangeError("Invalid video-input or output duration");
  // Adaptive framing can follow a source as wide as 2.5:1. Cover that area
  // even when the user selects a narrower ratio.
  const pixels = resolution === "1080p" ? 2700n * 1080n : 1800n * 720n;
  // Round the source length upward; BytePlus's estimate uses 24 fps and
  // (input + output) seconds * output pixels / 1024.
  const seconds = BigInt(
    Math.ceil(inputDurationMs / 1_000) + outputDurationSeconds,
  );
  return divideRoundUp(seconds * pixels * 24n, 1024n);
}

export function quoteVideoInputReservation(params: {
  inputDurationMs: number;
  resolution: "720p" | "1080p";
  rateMicroUsdPerThousandTokens: bigint;
  exchangeRate: ExchangeRateSnapshot;
  targetGrossMarginBps: number;
  creditsPerBaisa: bigint;
}): CreditQuote {
  // Reserve for the provider's full 30-second output envelope plus 25% for
  // token-estimate variance/minimums. The final capture is capped at this
  // disclosed reservation; any provider overrun is borne by the platform.
  const tokens = estimateVideoInputTokens(
    params.inputDurationMs,
    30,
    params.resolution,
  );
  return createCreditQuote({
    providerCostMicroUsd: videoInputProviderCost(
      divideRoundUp(tokens * 125n, 100n),
      params.rateMicroUsdPerThousandTokens,
    ),
    exchangeRate: params.exchangeRate,
    targetGrossMarginBps: params.targetGrossMarginBps,
    creditsPerBaisa: params.creditsPerBaisa,
  });
}

export interface WorstSupportedVideoCase {
  readonly maxDurationSeconds: number;
  readonly maxResolution: string;
  readonly supportsAudio: boolean;
  readonly worstCaseMultiplierBps: bigint;
}

export function getWorstSupportedVideoCase(
  capabilities: unknown,
  baseUnitSeconds = 5,
): WorstSupportedVideoCase {
  let maxDurationSeconds = baseUnitSeconds;
  let maxResolution = "720p";
  let supportsAudio = true;

  if (
    capabilities &&
    typeof capabilities === "object" &&
    !Array.isArray(capabilities)
  ) {
    const caps = capabilities as Record<string, unknown>;

    if (
      typeof caps.maximumDurationSeconds === "number" &&
      caps.maximumDurationSeconds > 0
    ) {
      maxDurationSeconds = Math.max(
        maxDurationSeconds,
        caps.maximumDurationSeconds,
      );
    }
    for (const key of Object.keys(caps)) {
      if (key.startsWith("durationSeconds:") && caps[key] === true) {
        const sec = Number.parseInt(key.slice("durationSeconds:".length), 10);
        if (Number.isFinite(sec) && sec > maxDurationSeconds) {
          maxDurationSeconds = sec;
        }
      }
      if (key.startsWith("resolution:") && caps[key] === true) {
        const res = key.slice("resolution:".length);
        const currentBps = getResolutionMultiplierBps(maxResolution);
        const candidateBps = getResolutionMultiplierBps(res);
        if (candidateBps > currentBps) {
          maxResolution = res;
        }
      }
    }
    if (caps.generateAudio === false) {
      supportsAudio = false;
    }
  }

  const durationMultiplier = calculateBillableUnits(
    BigInt(maxDurationSeconds),
    BigInt(baseUnitSeconds),
  );
  const resolutionBps = getResolutionMultiplierBps(maxResolution);
  const audioBps = getAudioMultiplierBps(supportsAudio);

  const worstCaseMultiplierBps = divideRoundUp(
    durationMultiplier * resolutionBps * audioBps,
    BASIS_POINTS,
  );

  return {
    maxDurationSeconds,
    maxResolution,
    supportsAudio,
    worstCaseMultiplierBps,
  };
}

export function assertFlatVideoPriceCoversWorstCase(
  providerCostMicroUsd: bigint,
  baseUnitCostMicroUsd: bigint,
  capabilities: unknown,
  baseUnitSeconds = 5,
): void {
  const worstCase = getWorstSupportedVideoCase(capabilities, baseUnitSeconds);
  const minRequiredCost = divideRoundUp(
    baseUnitCostMicroUsd * worstCase.worstCaseMultiplierBps,
    BASIS_POINTS,
  );

  if (providerCostMicroUsd < minRequiredCost) {
    throw new RangeError(
      `Flat video pricing (${providerCostMicroUsd} micro-USD) does not cover worst supported case ` +
        `(${worstCase.maxDurationSeconds}s, ${worstCase.maxResolution}${worstCase.supportsAudio ? " + audio" : ""}, requires at least ${minRequiredCost} micro-USD). ` +
        `Use parameter-sensitive 'SECOND' pricing or explicitly price the worst case.`,
    );
  }
}
