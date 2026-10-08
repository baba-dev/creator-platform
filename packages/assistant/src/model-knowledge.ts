import { db } from "@aiwa/db";
import { parseTextUsageRatesForProvider } from "@aiwa/credits";
import {
  getProviderRuntimeReadiness,
  listStudioTasksForModel,
  STUDIO_TASK_LABELS,
  type ProviderEnvironment,
  type StudioTask,
} from "@aiwa/providers";

export type PixelModelKind = "IMAGE" | "VIDEO" | "VOICE" | "TEXT";

export interface PixelModelQuery {
  kind?: PixelModelKind;
  query?: string;
  modelId?: string;
  page?: number;
  pageSize?: number;
}

const MAX_PAGE_SIZE = 20;
const OMIT_CAPABILITY = /(?:secret|password|credential|access.?key|api.?key|bearer|authorization|private.?key|endpoint|base.?url)/i;

// Capabilities are provider/admin-maintained data. Expose only bounded primitive
// public metadata; never copy arbitrary nested objects or credentials into Pixel.
export function publicModelCapabilities(value: unknown): Record<string, string | number | boolean | string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string | number | boolean | string[]> = {};
  for (const [key, raw] of Object.entries(value).slice(0, 100)) {
    if (!/^[a-zA-Z][a-zA-Z0-9:_-]{0,63}$/.test(key) || OMIT_CAPABILITY.test(key)) continue;
    if (typeof raw === "boolean") result[key] = raw;
    else if (typeof raw === "number" && Number.isFinite(raw)) result[key] = raw;
    else if (typeof raw === "string" && raw.length <= 160) result[key] = raw;
    else if (Array.isArray(raw) && raw.length <= 16 &&
      raw.every((item) => typeof item === "string" && item.length <= 60)) {
      result[key] = raw;
    }
  }
  return result;
}

function validTaskPricing(task: StudioTask, kind: string, provider: string, price: {
  pricingDimension: string;
  usageRates: unknown;
}): boolean {
  if (["chat", "character-chat", "scriptwriting", "creative-director", "brand-strategy", "story-planning"].includes(task)) {
    return kind === "TEXT" && validTextPricing(provider, price);
  }
  if (task === "prompt-enhancement") {
    return price.pricingDimension === "REQUEST" || validTextPricing(provider, price);
  }
  if (task === "speech-synthesis") {
    return ["CHARACTER", "REQUEST"].includes(price.pricingDimension);
  }
  if (task === "transcription") {
    return ["SECOND", "REQUEST"].includes(price.pricingDimension);
  }
  return true;
}

function validTextPricing(provider: string, price: {
  pricingDimension: string;
  usageRates: unknown;
}): boolean {
  if (price.pricingDimension !== "TOKEN") return false;
  if (price.usageRates == null) return true; // Legacy fixed-unit TOKEN snapshots.
  try {
    parseTextUsageRatesForProvider(price.usageRates, provider);
    return true;
  } catch {
    return false;
  }
}

export async function getPixelModelCatalog(
  input: PixelModelQuery = {},
  options: { now?: Date; environment?: ProviderEnvironment } = {},
) {
  const now = options.now ?? new Date();
  const rows = await db.providerModel.findMany({
    where: {
      enabled: true,
      ...(input.kind ? { mediaKind: input.kind } : {}),
      priceVersions: {
        some: {
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
      },
    },
    orderBy: [
      { mediaKind: "asc" },
      { displayName: "asc" },
      { id: "asc" },
    ],
    select: {
      id: true,
      provider: true,
      providerModelId: true,
      displayName: true,
      description: true,
      mediaKind: true,
      capabilities: true,
      priceVersions: {
        where: {
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
        take: 1,
        select: {
          id: true,
          customerCredits: true,
          pricingDimension: true,
          unitQuantity: true,
          usageRates: true,
        },
      },
    },
  });

  const models = rows.flatMap((row) => {
    const price = row.priceVersions[0];
    if (!price) return [];
    // A disabled or unconfigured provider is not an available end-user model.
    if (!getProviderRuntimeReadiness({
      provider: row.provider,
      mediaKind: row.mediaKind,
      providerModelId: row.providerModelId,
    }, options.environment).configured) return [];

    const capabilities = publicModelCapabilities(row.capabilities);
    const tasks = listStudioTasksForModel({
      id: row.providerModelId,
      provider: row.provider,
      mediaKind: row.mediaKind,
      capabilities: capabilities as Record<string, string | number | boolean>,
    }).filter((task) => validTaskPricing(task, row.mediaKind, row.provider, price));

    // For TEXT models, do not advertise models without a priced user-facing task.
    // Special media models may use dedicated UIs beyond the Studio task taxonomy.
    if (row.mediaKind === "TEXT" && tasks.length === 0) return [];

    return [{
      id: row.id,
      providerModelId: row.providerModelId,
      name: row.displayName,
      provider: row.provider,
      kind: row.mediaKind,
      description: row.description.slice(0, 600),
      tasks: tasks.map((task) => STUDIO_TASK_LABELS[task]),
      capabilities,
      pricing: {
        priceVersionId: price.id,
        dimension: price.pricingDimension,
        unitQuantity: price.unitQuantity,
        baseCredits: price.customerCredits.toString(),
        note: "Published base-unit credits, not a final job quote. Usage, duration, output count and other settings can change the charge.",
      },
    }];
  });

  const needle = input.query?.trim().toLocaleLowerCase() ?? "";
  const matching = models.filter((model) => {
    if (input.modelId && model.id !== input.modelId && model.providerModelId !== input.modelId) return false;
    if (!needle) return true;
    return [model.name, model.providerModelId, model.provider, model.kind, model.description, ...model.tasks]
      .some((field) => field.toLocaleLowerCase().includes(needle));
  });
  const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, input.pageSize ?? 10));
  const page = Math.max(1, Math.min(1000, input.page ?? 1));
  const start = (page - 1) * pageSize;
  return {
    models: matching.slice(start, start + pageSize),
    total: matching.length,
    page,
    pageSize,
    hasMore: start + pageSize < matching.length,
    nextPage: start + pageSize < matching.length ? page + 1 : null,
    scope: "Enabled, currently priced and runtime-configured models. Features are verified for applicable Studio tasks; job admission and final cost require a fresh quote.",
    updatedAt: now.toISOString(),
  };
}
