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
  estimator: "byteplus-video-v1";
  rates: UsageRate[];
}

/** Versioned policy: future estimators must be registered, never evaluated from JSON. */
export function parseUsageRates(value: unknown): UsageRates {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new RangeError("Token pricing requires a rate table.");
  const config = value as Record<string, unknown>;
  if (
    config.estimator !== "byteplus-video-v1" ||
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
  return { estimator: "byteplus-video-v1", rates };
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
    (params.inputDurationMs !== undefined &&
      (!Number.isSafeInteger(params.inputDurationMs) ||
        params.inputDurationMs < 2000 ||
        params.inputDurationMs > 30000))
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
    params.durationSeconds * 1000 + (params.inputDurationMs ?? 0),
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
  referenceImageCount?: number;
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
    billableQuantity = durationSeconds;
    if (price.pricingDimension === "TOKEN") {
      const rate = selectUsageRate(
        price.usageRates,
        resolution,
        params.inputDurationMs !== undefined,
      );
      estimatedTokens = estimateVideoTokens({
        resolution,
        aspectRatio: params.aspectRatio ?? "16:9",
        durationSeconds,
        inputDurationMs: params.inputDurationMs,
      });
      quote = quoteSnapshotCost(
        price,
        videoInputProviderCost(estimatedTokens, rate),
      );
      // References can alter duration/framing. Preserve the full 30s provider envelope.
      const envelope = estimateVideoTokens({
        resolution,
        aspectRatio: params.aspectRatio ?? "16:9",
        durationSeconds:
          params.inputDurationMs !== undefined ? 30 : durationSeconds,
        inputDurationMs: params.inputDurationMs,
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
        params.inputDurationMs === undefined
      )
        throw new RangeError(
          "Publish token pricing for Seedance 2.5 before generating.",
        );
      const legacy = calculateVideoPricing({
        providerCostMicroUsd: price.providerCostMicroUsd,
        durationSeconds,
        resolution,
        generateAudio: params.generateAudio,
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
      if (params.inputDurationMs !== undefined) {
        const rate =
          resolution === "1080p"
            ? price.videoInputRate1080p
            : price.videoInputRate720p;
        if (!rate)
          throw new RangeError("Video-input token rate is unavailable.");
        reservation = quoteVideoInputReservation({
          inputDurationMs: params.inputDurationMs,
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
          inputDurationMs: params.inputDurationMs,
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
  } else {
    if (price.pricingDimension === "TOKEN")
      throw new RangeError("No estimator is registered for this media kind.");
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
