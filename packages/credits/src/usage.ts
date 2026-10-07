import {
  createCreditQuote,
  calculateVideoPricing,
  quoteVideoInputReservation,
  videoInputProviderCost,
  calculateBillableUnits,
  countBillableCharacters,
  type CreditQuote,
} from "./index";

export interface UsageRate {
  resolution: "480p" | "720p" | "1080p" | "4K";
  workflow: "GENERATE" | "VIDEO_INPUT";
  microUsdPerThousandTokens: string;
}
export interface UsageRates {
  estimator: "byteplus-video-v1" | "byteplus-video-v2";
  rates: UsageRate[];
}

/** Versioned policy: future estimators must be registered, never evaluated from JSON. */
export function parseUsageRates(value: unknown): UsageRates {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new RangeError("Token pricing requires a rate table.");
  const config = value as Record<string, unknown>;
  if (
    !["byteplus-video-v1", "byteplus-video-v2"].includes(
      String(config.estimator),
    ) ||
    !Array.isArray(config.rates) ||
    config.rates.length < 1 ||
    config.rates.length > 8
  )
    throw new RangeError("Unsupported usage estimator or rate table.");
  const keys = new Set<string>();
  const rates: UsageRate[] = config.rates.map((raw: unknown) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new RangeError("Invalid usage rate.");
    const row = raw as Record<string, unknown>;
    if (
      !["480p", "720p", "1080p", "4K"].includes(String(row.resolution)) ||
      !["GENERATE", "VIDEO_INPUT"].includes(String(row.workflow)) ||
      typeof row.microUsdPerThousandTokens !== "string" ||
      !/^\d{1,19}$/.test(row.microUsdPerThousandTokens) ||
      BigInt(row.microUsdPerThousandTokens) <= 0n ||
      BigInt(row.microUsdPerThousandTokens) > 9223372036854775807n
    )
      throw new RangeError("Invalid usage rate.");
    const key = `${row.resolution}:${row.workflow}`;
    if (keys.has(key)) throw new RangeError("Duplicate usage rate.");
    keys.add(key);
    return {
      resolution: row.resolution as UsageRate["resolution"],
      workflow: row.workflow as UsageRate["workflow"],
      microUsdPerThousandTokens: row.microUsdPerThousandTokens,
    };
  });
  return {
    estimator: config.estimator as UsageRates["estimator"],
    rates,
  };
}
export function selectUsageRate(
  config: unknown,
  resolution: string,
  hasVideoInput: boolean,
): bigint {
  const row = parseUsageRates(config).rates.find(
    (r) =>
      r.resolution === resolution &&
      r.workflow === (hasVideoInput ? "VIDEO_INPUT" : "GENERATE"),
  );
  if (!row)
    throw new RangeError(
      "No token rate is configured for this resolution and workflow.",
    );
  return BigInt(row.microUsdPerThousandTokens);
}

export interface TextUsageTier {
  maxPromptTokens: number;
  inputMicroUsdPerMillionTokens: string;
  outputMicroUsdPerMillionTokens: string;
  cachedInputMicroUsdPerMillionTokens?: string;
}
export type TextUsageEstimator = "byteplus-text-v1" | "text-token-v1";

export interface TextUsageRates {
  estimator: TextUsageEstimator;
  tiers: TextUsageTier[];
}

const EXTERNAL_TEXT_PRICING_PROVIDERS = new Set([
  "NVIDIA",
  "GROQ",
  "GEMINI",
  "CLOUDFLARE",
]);

export function textUsageEstimatorForProvider(
  provider: string,
): TextUsageEstimator {
  const normalized = provider.trim().toUpperCase();
  if (normalized === "BYTEPLUS") return "byteplus-text-v1";
  if (EXTERNAL_TEXT_PRICING_PROVIDERS.has(normalized)) return "text-token-v1";
  throw new RangeError(
    `Token-priced text billing is not registered for provider '${provider}'.`,
  );
}

export function parseTextUsageRates(value: unknown): TextUsageRates {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new RangeError("Text token pricing requires a rate table.");
  const config = value as Record<string, unknown>;
  if (
    !["byteplus-text-v1", "text-token-v1"].includes(String(config.estimator)) ||
    !Array.isArray(config.tiers) ||
    config.tiers.length < 1 ||
    config.tiers.length > 4
  )
    throw new RangeError("Unsupported text usage estimator or rate table.");
  let previousMax = 0;
  const tiers = config.tiers.map((raw: unknown) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new RangeError("Invalid text usage tier.");
    const row = raw as Record<string, unknown>;
    const maxPromptTokens = Number(row.maxPromptTokens);
    const validRate = (rate: unknown) =>
      typeof rate === "string" &&
      /^\d{1,19}$/.test(rate) &&
      BigInt(rate) > 0n &&
      BigInt(rate) <= 9223372036854775807n;
    if (
      !Number.isSafeInteger(maxPromptTokens) ||
      maxPromptTokens <= previousMax ||
      maxPromptTokens > 1_048_576 ||
      !validRate(row.inputMicroUsdPerMillionTokens) ||
      !validRate(row.outputMicroUsdPerMillionTokens) ||
      (row.cachedInputMicroUsdPerMillionTokens !== undefined &&
        !validRate(row.cachedInputMicroUsdPerMillionTokens))
    )
      throw new RangeError("Invalid text usage tier.");
    previousMax = maxPromptTokens;
    return {
      maxPromptTokens,
      inputMicroUsdPerMillionTokens: String(row.inputMicroUsdPerMillionTokens),
      outputMicroUsdPerMillionTokens: String(
        row.outputMicroUsdPerMillionTokens,
      ),
      ...(row.cachedInputMicroUsdPerMillionTokens === undefined
        ? {}
        : {
            cachedInputMicroUsdPerMillionTokens: String(
              row.cachedInputMicroUsdPerMillionTokens,
            ),
          }),
    };
  });
  return { estimator: config.estimator as TextUsageRates["estimator"], tiers };
}

export function parseTextUsageRatesForProvider(
  value: unknown,
  provider: string,
): TextUsageRates {
  const table = parseTextUsageRates(value);
  const expected = textUsageEstimatorForProvider(provider);
  if (table.estimator !== expected) {
    throw new RangeError(
      `Provider ${provider.toUpperCase()} requires the ${expected} text pricing estimator.`,
    );
  }
  return table;
}

/**
 * Compatibility for price snapshots published before provider-specific text
 * estimator validation existed. Only the other registered estimator label is
 * repaired; missing tables, unknown labels and malformed tiers still fail.
 */
export function normalizeLegacyTextUsageRatesForProvider(
  value: unknown,
  provider: string,
): TextUsageRates {
  try {
    return parseTextUsageRatesForProvider(value, provider);
  } catch (originalError) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw originalError;
    }
    const config = value as Record<string, unknown>;
    const expected = textUsageEstimatorForProvider(provider);
    const legacyEstimator: TextUsageEstimator =
      expected === "byteplus-text-v1" ? "text-token-v1" : "byteplus-text-v1";
    if (config.estimator !== legacyEstimator) {
      throw originalError;
    }
    return parseTextUsageRatesForProvider(
      { ...config, estimator: expected },
      provider,
    );
  }
}

function divideRoundUpBigInt(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

export function textProviderCostMicroUsd(
  config: unknown,
  usage: {
    promptTokens: number;
    completionTokens: number;
    cachedPromptTokens?: number;
  },
): bigint {
  if (
    !Number.isSafeInteger(usage.promptTokens) ||
    usage.promptTokens < 0 ||
    !Number.isSafeInteger(usage.completionTokens) ||
    usage.completionTokens < 0 ||
    !Number.isSafeInteger(usage.cachedPromptTokens ?? 0) ||
    (usage.cachedPromptTokens ?? 0) < 0 ||
    (usage.cachedPromptTokens ?? 0) > usage.promptTokens
  )
    throw new RangeError("Invalid text token usage.");
  const table = parseTextUsageRates(config);
  const tier = table.tiers.find(
    (candidate) => usage.promptTokens <= candidate.maxPromptTokens,
  );
  if (!tier) {
    throw new RangeError(
      "Prompt token usage exceeds the configured text pricing tiers.",
    );
  }
  const cached = usage.cachedPromptTokens ?? 0;
  const uncached = usage.promptTokens - cached;
  const inputRate = BigInt(tier.inputMicroUsdPerMillionTokens);
  const outputRate = BigInt(tier.outputMicroUsdPerMillionTokens);
  const cachedRate = BigInt(
    tier.cachedInputMicroUsdPerMillionTokens ??
      tier.inputMicroUsdPerMillionTokens,
  );
  const million = 1_000_000n;
  return (
    divideRoundUpBigInt(BigInt(uncached) * inputRate, million) +
    divideRoundUpBigInt(BigInt(cached) * cachedRate, million) +
    divideRoundUpBigInt(BigInt(usage.completionTokens) * outputRate, million)
  );
}

export interface PriceSnapshot {
  providerCostMicroUsd: bigint;
  fxBaisaNumerator: bigint;
  fxBaisaDenominator: bigint;
  targetMarginBps: number;
  creditsPerBaisa: bigint;
  pricingDimension: string;
  unitQuantity: number;
  usageRates?: unknown;
  videoInputRate720p?: bigint | null;
  videoInputRate1080p?: bigint | null;
}
export function quoteSnapshotCost(
  price: PriceSnapshot,
  cost: bigint,
): CreditQuote {
  return createCreditQuote({
    providerCostMicroUsd: cost,
    exchangeRate: {
      baisaNumerator: price.fxBaisaNumerator,
      baisaDenominator: price.fxBaisaDenominator,
    },
    targetGrossMarginBps: price.targetMarginBps,
    creditsPerBaisa: price.creditsPerBaisa,
  });
}
export function quoteImageOutputs(
  price: PriceSnapshot,
  outputs: number,
): CreditQuote {
  if (!Number.isSafeInteger(outputs) || outputs < 1 || outputs > 15)
    throw new RangeError("Invalid image count.");
  const single = quoteSnapshotCost(price, price.providerCostMicroUsd);
  const count = BigInt(outputs);
  if (
    single.customerCredits * count > 9223372036854775807n ||
    single.providerCostMicroUsd * count > 9223372036854775807n
  )
    throw new RangeError("Image quote exceeds ledger range.");
  return {
    ...single,
    providerCostMicroUsd: single.providerCostMicroUsd * count,
    convertedCostBaisa: single.convertedCostBaisa * count,
    customerPriceBaisa: single.customerPriceBaisa * count,
    customerCredits: single.customerCredits * count,
  };
}

const SEEDREAM_5_PRO_IDS = new Set([
  "dola-seedream-5-0-pro-260628",
  "seedream-5-0-pro-260628",
  "seedream-5-0-pro",
]);

export function getImageGenerationProviderCostMicroUsd(params: {
  providerModelId: string;
  baseCostMicroUsd: bigint;
  resolution?: string;
  outputCount: number;
  referenceImageCount?: number;
}): bigint {
  if (
    !Number.isSafeInteger(params.outputCount) ||
    params.outputCount < 1 ||
    params.outputCount > 15
  ) {
    throw new RangeError("Invalid image count.");
  }

  const references = params.referenceImageCount ?? 0;
  if (!Number.isSafeInteger(references) || references < 0 || references > 14) {
    throw new RangeError("Invalid reference image count.");
  }

  if (!SEEDREAM_5_PRO_IDS.has(params.providerModelId)) {
    return params.baseCostMicroUsd * BigInt(params.outputCount);
  }
  if (params.outputCount !== 1) {
    throw new RangeError(
      "Seedream 5.0 Pro supports one generated image per request.",
    );
  }

  const resolution = params.resolution ?? "2K";
  if (resolution !== "1K" && resolution !== "1.5K" && resolution !== "2K") {
    throw new RangeError("Unsupported Seedream 5.0 Pro resolution.");
  }

  // The active price version stores the discounted <=1.5K output rate.
  // BytePlus prices 2K at 2x that rate and each additional input image
  // after the first at 1/15th of the <=1.5K output rate.
  const outputCost =
    resolution === "2K"
      ? params.baseCostMicroUsd * 2n
      : params.baseCostMicroUsd;
  const extraReferenceCount = BigInt(Math.max(0, references - 1));
  const referenceUnitCost = (params.baseCostMicroUsd + 14n) / 15n;
  return outputCost + referenceUnitCost * extraReferenceCount;
}

export function quoteImageGeneration(
  price: PriceSnapshot,
  params: {
    providerModelId: string;
    resolution?: string;
    outputCount: number;
    referenceImageCount?: number;
  },
): CreditQuote {
  if (!SEEDREAM_5_PRO_IDS.has(params.providerModelId)) {
    return quoteImageOutputs(price, params.outputCount);
  }
  return quoteSnapshotCost(
    price,
    getImageGenerationProviderCostMicroUsd({
      providerModelId: params.providerModelId,
      baseCostMicroUsd: price.providerCostMicroUsd,
      resolution: params.resolution,
      outputCount: params.outputCount,
      referenceImageCount: params.referenceImageCount,
    }),
  );
}

/** Size estimate; provider completion_tokens remains the settlement authority. */
export function estimateVideoTokens(params: {
  resolution: string;
  aspectRatio: string;
  durationSeconds: number;
  inputDurationMs?: number;
  totalInputVideoDurationMs?: number;
  conservative?: boolean;
}): bigint {
  const height = { "480p": 480n, "720p": 720n, "1080p": 1080n, "4K": 2160n }[
    params.resolution
  ];
  if (
    !height ||
    !Number.isSafeInteger(params.durationSeconds) ||
    params.durationSeconds < 4 ||
    params.durationSeconds > 30 ||
    ((params.totalInputVideoDurationMs ?? params.inputDurationMs) !==
      undefined &&
      (!Number.isSafeInteger(
        params.totalInputVideoDurationMs ?? params.inputDurationMs,
      ) ||
        (params.totalInputVideoDurationMs ?? params.inputDurationMs)! < 2000 ||
        (params.totalInputVideoDurationMs ?? params.inputDurationMs)! > 30000))
  )
    throw new RangeError(
      "Video duration or resolution is outside estimator limits.",
    );
  const ratios: Record<string, readonly [bigint, bigint]> = {
    "16:9": [16n, 9n],
    "9:16": [16n, 9n],
    "1:1": [1n, 1n],
    "4:3": [4n, 3n],
    "3:4": [4n, 3n],
    "21:9": [21n, 9n],
    adaptive: [5n, 2n],
  };
  const ratio = ratios[params.conservative ? "adaptive" : params.aspectRatio];
  if (!ratio) throw new RangeError("Unsupported video aspect ratio.");
  const width = (height * ratio[0] + ratio[1] - 1n) / ratio[1];
  const milliseconds = BigInt(
    params.durationSeconds * 1000 +
      (params.totalInputVideoDurationMs ?? params.inputDurationMs ?? 0),
  );
  return (width * height * 24n * milliseconds + 1023999n) / 1024000n;
}
export interface GenerationEstimate {
  quote: CreditQuote;
  reservation: CreditQuote;
  estimatedTokens: bigint | null;
  units: number;
  billableQuantity: number;
  settlement: "FIXED" | "ACTUAL_USAGE";
}
export function estimateGeneration(params: {
  price: PriceSnapshot;
  mediaKind: string;
  providerModelId: string;
  units?: number;
  text?: string;
  billableQuantity?: number;
  durationSeconds?: number;
  resolution?: string;
  aspectRatio?: string;
  generateAudio?: boolean;
  inputDurationMs?: number;
  totalInputVideoDurationMs?: number;
  referenceImageCount?: number;
  reservationBillableQuantity?: number;
}): GenerationEstimate {
  const { price } = params;
  let quote: CreditQuote;
  let reservation: CreditQuote;
  let units = params.units ?? 1;
  let billableQuantity = units;
  let estimatedTokens: bigint | null = null;
  let settlement: GenerationEstimate["settlement"] = "FIXED";
  if (params.mediaKind === "VIDEO") {
    const durationSeconds = params.durationSeconds ?? 5;
    const resolution = params.resolution ?? "720p";
    const totalInputVideoDurationMs =
      params.totalInputVideoDurationMs ?? params.inputDurationMs;
    billableQuantity = durationSeconds;
    if (price.pricingDimension === "TOKEN") {
      const rate = selectUsageRate(
        price.usageRates,
        resolution,
        totalInputVideoDurationMs !== undefined,
      );
      estimatedTokens = estimateVideoTokens({
        resolution,
        aspectRatio: params.aspectRatio ?? "16:9",
        durationSeconds,
        totalInputVideoDurationMs,
      });
      quote = quoteSnapshotCost(
        price,
        videoInputProviderCost(estimatedTokens, rate),
      );
      // For video-input jobs reserve against the provider's maximum aggregate
      // input envelope for the selected model, plus 25% estimate variance.
      // Actual completion_tokens remains authoritative at settlement.
      const envelope = estimateVideoTokens({
        resolution,
        aspectRatio: params.aspectRatio ?? "16:9",
        durationSeconds,
        totalInputVideoDurationMs:
          totalInputVideoDurationMs === undefined
            ? undefined
            : params.providerModelId.startsWith("dreamina-seedance-2-5-")
              ? 30_000
              : 15_000,
        conservative: true,
      });
      reservation = quoteSnapshotCost(
        price,
        videoInputProviderCost((envelope * 125n + 99n) / 100n, rate),
      );
      units = Number(estimatedTokens);
      settlement = "ACTUAL_USAGE";
    } else {
      if (
        params.providerModelId.startsWith("dreamina-seedance-2-5-") &&
        totalInputVideoDurationMs === undefined
      )
        throw new RangeError(
          "Publish token pricing for Seedance 2.5 before generating.",
        );
      const isOmniHuman = params.providerModelId === "omnihuman-1.5";
      if (isOmniHuman && price.pricingDimension !== "SECOND")
        throw new RangeError("OmniHuman 1.5 requires per-second pricing.");
      const legacy = calculateVideoPricing({
        providerCostMicroUsd: price.providerCostMicroUsd,
        durationSeconds,
        resolution: isOmniHuman ? undefined : resolution,
        generateAudio: isOmniHuman ? false : params.generateAudio,
        pricingDimension: price.pricingDimension,
        unitQuantity: price.unitQuantity,
        exchangeRate: {
          baisaNumerator: price.fxBaisaNumerator,
          baisaDenominator: price.fxBaisaDenominator,
        },
        targetGrossMarginBps: price.targetMarginBps,
        creditsPerBaisa: price.creditsPerBaisa,
      });
      quote = legacy.quote;
      reservation = quote;
      units = Number(legacy.durationUnits);
      if (totalInputVideoDurationMs !== undefined) {
        const rate =
          resolution === "1080p"
            ? price.videoInputRate1080p
            : price.videoInputRate720p;
        if (!rate)
          throw new RangeError("Video-input token rate is unavailable.");
        reservation = quoteVideoInputReservation({
          inputDurationMs: totalInputVideoDurationMs,
          resolution: resolution === "1080p" ? "1080p" : "720p",
          rateMicroUsdPerThousandTokens: rate,
          exchangeRate: {
            baisaNumerator: price.fxBaisaNumerator,
            baisaDenominator: price.fxBaisaDenominator,
          },
          targetGrossMarginBps: price.targetMarginBps,
          creditsPerBaisa: price.creditsPerBaisa,
        });
        estimatedTokens = estimateVideoTokens({
          resolution,
          aspectRatio: params.aspectRatio ?? "16:9",
          durationSeconds,
          totalInputVideoDurationMs,
        });
        quote = quoteSnapshotCost(
          price,
          videoInputProviderCost(estimatedTokens, rate),
        );
        settlement = "ACTUAL_USAGE";
      }
    }
  } else if (params.mediaKind === "IMAGE") {
    quote = quoteImageGeneration(price, {
      providerModelId: params.providerModelId,
      resolution: params.resolution,
      outputCount: units,
      referenceImageCount: params.referenceImageCount,
    });
    reservation = quote;
  } else if (params.mediaKind === "TEXT") {
    const promptText = params.text?.trim() ?? "";
    const promptLength = promptText
      ? countBillableCharacters(promptText)
      : (params.billableQuantity ?? 0);
    const estimatedInputTokens = Math.max(1, Math.ceil(promptLength / 3.5));
    const requestedCompletionTokens = Math.max(1, params.units ?? 1024);
    estimatedTokens = BigInt(estimatedInputTokens + requestedCompletionTokens);
    billableQuantity = Number(estimatedTokens);
    units = Number(calculateBillableUnits(estimatedTokens, price.unitQuantity));
    const estimatedCost =
      price.usageRates &&
      typeof price.usageRates === "object" &&
      !Array.isArray(price.usageRates) &&
      ["byteplus-text-v1", "text-token-v1"].includes(
        String((price.usageRates as Record<string, unknown>).estimator),
      )
        ? textProviderCostMicroUsd(price.usageRates, {
            promptTokens: estimatedInputTokens,
            completionTokens: requestedCompletionTokens,
          })
        : price.providerCostMicroUsd * BigInt(units);
    quote = quoteSnapshotCost(price, estimatedCost);
    // Tokenization differs by language/code. Reserve a 25% input safety envelope
    // while preserving the configured output cap.
    const reservationInputTokens = Math.max(
      estimatedInputTokens,
      promptLength || estimatedInputTokens,
    );
    const reservationCost =
      price.usageRates &&
      typeof price.usageRates === "object" &&
      !Array.isArray(price.usageRates) &&
      ["byteplus-text-v1", "text-token-v1"].includes(
        String((price.usageRates as Record<string, unknown>).estimator),
      )
        ? textProviderCostMicroUsd(price.usageRates, {
            promptTokens: reservationInputTokens,
            completionTokens: requestedCompletionTokens,
          })
        : price.providerCostMicroUsd *
          calculateBillableUnits(
            BigInt(reservationInputTokens + requestedCompletionTokens),
            price.unitQuantity,
          );
    reservation = quoteSnapshotCost(price, reservationCost);
    settlement = "ACTUAL_USAGE";
  } else {
    if (price.pricingDimension === "TOKEN")
      throw new RangeError("No estimator is registered for this media kind.");
    if (params.mediaKind === "VOICE" && price.pricingDimension === "SECOND") {
      billableQuantity = params.billableQuantity ?? params.durationSeconds ?? 0;
      if (!Number.isSafeInteger(billableQuantity) || billableQuantity <= 0)
        throw new RangeError(
          "Seed Audio quotes require a valid estimated duration.",
        );
      units = Number(
        calculateBillableUnits(BigInt(billableQuantity), price.unitQuantity),
      );
    }
    if (price.pricingDimension === "CHARACTER") {
      billableQuantity =
        params.text !== undefined
          ? countBillableCharacters(params.text.trim())
          : (params.billableQuantity ?? 0);
      if (billableQuantity <= 0)
        throw new RangeError(
          "Voice quotes require nonempty text or billable quantity.",
        );
      units = Number(
        calculateBillableUnits(billableQuantity, price.unitQuantity),
      );
    }
    quote = quoteSnapshotCost(
      price,
      price.providerCostMicroUsd * BigInt(units),
    );
    reservation = quote;
    if (
      params.mediaKind === "VOICE" &&
      params.providerModelId === "seed-audio-1.0" &&
      price.pricingDimension === "SECOND"
    ) {
      const reservationQuantity = params.reservationBillableQuantity ?? 120;
      if (
        !Number.isSafeInteger(reservationQuantity) ||
        reservationQuantity < billableQuantity ||
        reservationQuantity > 10_000
      )
        throw new RangeError("Invalid Seed Audio reservation envelope.");
      const maximumUnits = calculateBillableUnits(
        BigInt(reservationQuantity),
        price.unitQuantity,
      );
      reservation = quoteSnapshotCost(
        price,
        price.providerCostMicroUsd * maximumUnits,
      );
    }
  }
  return {
    quote,
    reservation,
    estimatedTokens,
    units,
    billableQuantity,
    settlement,
  };
}
