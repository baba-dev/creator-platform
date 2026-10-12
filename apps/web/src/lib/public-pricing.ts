import {
  createCreditQuote,
  parseTextUsageRatesForProvider,
  textProviderCostMicroUsd,
  calculateBillableUnits,
} from "@aiwa/credits";
import { db } from "@aiwa/db";
import { retailMicroUsdApprox } from "./customer-cost-breakdown";
import {
  getProviderRuntimeReadiness,
  listStudioTasksForModel,
  STUDIO_TASK_LABELS,
} from "@aiwa/providers";
import type { StudioTask } from "@aiwa/providers";
import { isBytePlusMediaKitConfigured } from "@aiwa/providers/byteplus";

import type {
  PricingCategory,
  PublicPriceTier,
  PublicPricingItem,
  PublicPricingCatalogue,
} from "./public-pricing-contract";
export { pricingCategories } from "./public-pricing-contract";
export type {
  PricingCategory,
  PublicPriceTier,
  PublicPricingItem,
  PublicPricingCatalogue,
} from "./public-pricing-contract";

type FinancialSnapshot = {
  providerCostMicroUsd: bigint;
  customerCredits: bigint;
  fxBaisaNumerator: bigint;
  fxBaisaDenominator: bigint;
  targetMarginBps: number;
  creditsPerBaisa: bigint;
};

export function formatCustomerOmr(
  credits: bigint,
  creditsPerBaisa: bigint,
): string {
  if (
    credits < 0n ||
    creditsPerBaisa <= 0n ||
    credits % creditsPerBaisa !== 0n
  ) {
    throw new RangeError("Invalid customer credit conversion.");
  }
  const baisa = credits / creditsPerBaisa;
  return (
    (baisa / 1000n).toString() +
    "." +
    (baisa % 1000n).toString().padStart(3, "0") +
    " OMR"
  );
}

function customerQuote(
  snapshot: FinancialSnapshot,
  providerCostMicroUsd: bigint,
) {
  return createCreditQuote({
    providerCostMicroUsd,
    exchangeRate: {
      baisaNumerator: snapshot.fxBaisaNumerator,
      baisaDenominator: snapshot.fxBaisaDenominator,
    },
    targetGrossMarginBps: snapshot.targetMarginBps,
    creditsPerBaisa: snapshot.creditsPerBaisa,
  });
}

function publicCapabilities(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  const safeNames: Record<string, string> = {
    contextWindow: "Context window",
    maxTokens: "Maximum output tokens",
    reasoning: "Reasoning",
    fast: "Fast",
    flash: "Fast",
    generateAudio: "Audio generation",
    multiReference: "Multiple references",
    imageEditing: "Image editing",
    transcription: "Transcription",
    characterChat: "Character chat",
  };
  const result: string[] = [];
  for (const [key, label] of Object.entries(safeNames)) {
    const value = record[key];
    if (value === true) result.push(label);
    if (
      (key === "contextWindow" || key === "maxTokens") &&
      typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value > 0
    )
      result.push(label + ": " + value.toLocaleString("en-US"));
  }
  for (const [key, value] of Object.entries(record)) {
    if (value !== true) continue;
    if (key.startsWith("resolution:") || key.startsWith("durationSeconds:")) {
      result.push(
        key.replace("resolution:", "").replace("durationSeconds:", "") +
          (key.startsWith("duration") ? " s" : ""),
      );
    }
  }
  return result.slice(0, 18);
}

function categoryFor(
  kind: string,
  id: string,
  tasks: readonly StudioTask[],
): PricingCategory {
  if (kind === "TEXT") return "chat";
  if (kind === "IMAGE") return "image";
  if (kind === "VIDEO")
    return /omnihuman|dreamactor|avatar/i.test(id) ? "avatar" : "video";
  if (tasks.includes("transcription")) return "transcription";
  if (/seed.audio|seed-audio|dola.audio/i.test(id)) return "audio";
  return "speech";
}

/** Deliberately allowlist the public projection; never spread a DB model or a pricing snapshot. */
export function publicModelItem(row: {
  id: string;
  provider: string;
  providerModelId: string;
  displayName: string;
  description: string;
  mediaKind: string;
  capabilities: unknown;
  priceVersions: (FinancialSnapshot & {
    id: string;
    effectiveFrom: Date;
    pricingDimension: string;
    unitQuantity: number;
    usageRates: unknown;
  })[];
}): PublicPricingItem | null {
  const price = row.priceVersions[0];
  if (!price || price.creditsPerBaisa <= 0n) return null;
  const descriptor = {
    id: row.providerModelId,
    provider: row.provider,
    mediaKind: row.mediaKind,
    capabilities: (row.capabilities &&
    typeof row.capabilities === "object" &&
    !Array.isArray(row.capabilities)
      ? row.capabilities
      : {}) as Record<string, boolean | number | string>,
  };
  const tasks = listStudioTasksForModel(descriptor).filter((task) => {
    if (
      (task === "chat" ||
        task === "character-chat" ||
        task === "scriptwriting" ||
        task === "creative-director" ||
        task === "brand-strategy" ||
        task === "story-planning") &&
      price.pricingDimension !== "TOKEN"
    )
      return false;
    if (task === "speech-synthesis")
      return (
        price.pricingDimension === "CHARACTER" ||
        price.pricingDimension === "REQUEST"
      );
    if (task === "transcription")
      return (
        price.pricingDimension === "SECOND" ||
        price.pricingDimension === "REQUEST"
      );
    if (task === "prompt-enhancement")
      return (
        price.pricingDimension === "REQUEST" ||
        price.pricingDimension === "TOKEN"
      );
    return true;
  });
  const dedicatedAudio =
    row.mediaKind === "VOICE" &&
    /seed[-_.]?audio/i.test(row.providerModelId) &&
    descriptor.capabilities.audioGeneration === true;
  if (tasks.length === 0 && !dedicatedAudio) return null;
  const category = categoryFor(row.mediaKind, row.providerModelId, tasks);
  let tiers: PublicPriceTier[] = [];
  if (
    row.mediaKind === "TEXT" &&
    price.pricingDimension === "TOKEN" &&
    price.usageRates != null
  ) {
    try {
      const parsed = parseTextUsageRatesForProvider(
        price.usageRates,
        row.provider,
      );
      tiers = parsed.tiers.map((tier) => {
        const convert = (value: string) =>
          customerQuote(price, BigInt(value)).customerCredits.toString();
        return {
          maxPromptTokens: tier.maxPromptTokens,
          inputCreditsPerMillion: convert(tier.inputMicroUsdPerMillionTokens),
          outputCreditsPerMillion: convert(tier.outputMicroUsdPerMillionTokens),
          cachedInputCreditsPerMillion: tier.cachedInputMicroUsdPerMillionTokens
            ? convert(tier.cachedInputMicroUsdPerMillionTokens)
            : null,
        };
      });
    } catch {
      return null;
    }
  }
  // Do not publish a bogus fixed rate for legacy token snapshots missing a usage table.
  if (
    row.mediaKind === "TEXT" &&
    price.pricingDimension === "TOKEN" &&
    tiers.length === 0
  )
    return null;
  const simpleUnit =
    row.mediaKind === "VOICE" &&
    !dedicatedAudio &&
    price.usageRates == null &&
    (price.pricingDimension === "CHARACTER" ||
      price.pricingDimension === "SECOND" ||
      price.pricingDimension === "REQUEST");
  return {
    id: row.id,
    kind: "model",
    name: row.displayName,
    provider: row.provider,
    description: row.description.slice(0, 900),
    category,
    availableIn: [
      ...tasks.map((task) => STUDIO_TASK_LABELS[task]),
      ...(dedicatedAudio ? ["Audio Generation"] : []),
    ],
    capabilities: publicCapabilities(row.capabilities),
    dimension: price.pricingDimension,
    unitQuantity: price.unitQuantity,
    creditsPerBaisa: price.creditsPerBaisa.toString(),
    baseCredits: price.customerCredits.toString(),
    baseOmr: formatCustomerOmr(price.customerCredits, price.creditsPerBaisa),
    retailMicroUsdApprox: retailMicroUsdApprox(
      price.customerCredits / price.creditsPerBaisa,
      price.fxBaisaNumerator,
      price.fxBaisaDenominator,
    ),
    priceVersionId: price.id,
    effectiveFrom: price.effectiveFrom.toISOString(),
    tiers,
    exampleOnly: !simpleUnit || tiers.length > 0,
    calculator: tiers.length ? "text" : simpleUnit ? "unit" : "reference",
  };
}

export async function getPublicPricingCatalogue(
  now: Date = new Date(),
): Promise<PublicPricingCatalogue> {
  const active = {
    effectiveFrom: { lte: now },
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
  };
  const [models, tools] = await Promise.all([
    db.providerModel.findMany({
      where: { enabled: true, priceVersions: { some: active } },
      select: {
        id: true,
        provider: true,
        providerModelId: true,
        displayName: true,
        description: true,
        mediaKind: true,
        capabilities: true,
        priceVersions: {
          where: active,
          orderBy: { effectiveFrom: "desc" },
          take: 1,
          select: {
            id: true,
            effectiveFrom: true,
            pricingDimension: true,
            unitQuantity: true,
            usageRates: true,
            providerCostMicroUsd: true,
            customerCredits: true,
            fxBaisaNumerator: true,
            fxBaisaDenominator: true,
            targetMarginBps: true,
            creditsPerBaisa: true,
          },
        },
      },
      take: 150,
      orderBy: { displayName: "asc" },
    }),
    db.providerTool.findMany({
      where: { enabled: true, priceVersions: { some: active } },
      select: {
        id: true,
        provider: true,
        providerToolId: true,
        displayName: true,
        description: true,
        pricingMetric: true,
        category: true,
        priceVersions: {
          where: active,
          orderBy: { effectiveFrom: "desc" },
          take: 1,
          select: {
            id: true,
            effectiveFrom: true,
            pricingMetric: true,
            unitQuantity: true,
            customerCredits: true,
            creditsPerBaisa: true,
            fxBaisaNumerator: true,
            fxBaisaDenominator: true,
          },
        },
      },
      take: 150,
      orderBy: { displayName: "asc" },
    }),
  ]);
  const items = models.flatMap((row) => {
    if (
      !getProviderRuntimeReadiness({
        provider: row.provider,
        mediaKind: row.mediaKind,
        providerModelId: row.providerModelId,
      }).configured
    )
      return [];
    const item = publicModelItem(row);
    return item ? [item] : [];
  });
  if (isBytePlusMediaKitConfigured()) {
    for (const tool of tools) {
      const price = tool.priceVersions[0];
      if (
        !price ||
        price.pricingMetric !== tool.pricingMetric ||
        price.creditsPerBaisa <= 0n
      )
        continue;
      items.push({
        id: tool.id,
        kind: "tool",
        name: tool.displayName,
        provider: tool.provider,
        description: tool.description.slice(0, 900),
        category: "tools",
        availableIn: ["Media Tools"],
        capabilities: [tool.category],
        dimension: price.pricingMetric,
        unitQuantity: price.unitQuantity,
        creditsPerBaisa: price.creditsPerBaisa.toString(),
        baseCredits: price.customerCredits.toString(),
        baseOmr: formatCustomerOmr(
          price.customerCredits,
          price.creditsPerBaisa,
        ),
        retailMicroUsdApprox: retailMicroUsdApprox(
          price.customerCredits / price.creditsPerBaisa,
          price.fxBaisaNumerator,
          price.fxBaisaDenominator,
        ),
        priceVersionId: price.id,
        effectiveFrom: price.effectiveFrom.toISOString(),
        tiers: [],
        exampleOnly: price.pricingMetric !== "REQUEST",
        calculator: "reference",
      });
    }
  }
  return { generatedAt: now.toISOString(), models: items };
}

export type PublicEstimateInput = {
  id: string;
  version: string;
  units?: number;
  promptTokens?: number;
  completionTokens?: number;
  cachedPromptTokens?: number;
};

/** Public estimates cannot sign, reserve or create jobs. Variable media jobs need an authenticated quote. */
export async function estimatePublicPricing(input: PublicEstimateInput) {
  const catalogue = await getPublicPricingCatalogue();
  const item = catalogue.models.find(
    (model) =>
      model.kind === "model" &&
      model.id === input.id &&
      model.priceVersionId === input.version,
  );
  if (!item || item.calculator === "reference")
    throw new RangeError("This configuration needs an in-Studio quote.");
  const model = await db.providerModel.findUnique({
    where: { id: item.id },
    select: {
      priceVersions: {
        where: { id: item.priceVersionId },
        take: 1,
        select: {
          id: true,
          providerCostMicroUsd: true,
          customerCredits: true,
          fxBaisaNumerator: true,
          fxBaisaDenominator: true,
          targetMarginBps: true,
          creditsPerBaisa: true,
          pricingDimension: true,
          unitQuantity: true,
          usageRates: true,
        },
      },
    },
  });
  const price = model?.priceVersions[0];
  if (!price || price.id !== item.priceVersionId)
    throw new RangeError("The price changed. Refresh the catalogue.");
  let cost: bigint;
  let basis: string;
  if (item.calculator === "text") {
    if (
      input.promptTokens === undefined ||
      input.completionTokens === undefined
    )
      throw new RangeError("Token counts are required.");
    cost = textProviderCostMicroUsd(price.usageRates, {
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      cachedPromptTokens: input.cachedPromptTokens ?? 0,
    });
    basis = "Illustrative text token usage";
  } else {
    if (
      !Number.isSafeInteger(input.units) ||
      !input.units ||
      input.units < 1 ||
      input.units > 100000
    )
      throw new RangeError("Invalid usage quantity.");
    cost =
      price.providerCostMicroUsd *
      calculateBillableUnits(input.units, price.unitQuantity);
    basis = "Standard unit configuration";
  }
  const quote = customerQuote(price, cost);
  return {
    priceVersionId: price.id,
    estimatedCredits: quote.customerCredits.toString(),
    estimatedOmr: formatCustomerOmr(
      quote.customerCredits,
      price.creditsPerBaisa,
    ),
    basis,
    isEstimate: true,
    note: "Illustrative only. The authenticated Studio quote is authoritative before a generation is submitted.",
  };
}
