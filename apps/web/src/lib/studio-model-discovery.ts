import { db } from "@aiwa/db";
import {
  listStudioTasksForModel,
  STUDIO_TASK_DEFAULT_PROVIDER_MODEL_IDS,
  supportsStudioTask,
  type StudioTask,
} from "@aiwa/providers";

import {
  getProviderRuntimeReadiness,
  type ProviderEnvironment,
} from "./provider-readiness";

type ActivePrice = {
  id: string;
  pricingDimension: "TOKEN" | "REQUEST" | "CHARACTER" | "SECOND";
  unitQuantity: number;
};

export type StudioModelRow = {
  id: string;
  provider: string;
  providerModelId: string;
  displayName: string;
  description: string;
  mediaKind: string;
  enabled: boolean;
  capabilities: unknown;
  priceVersions: ActivePrice[];
};

export type PublicStudioModel = {
  id: string;
  provider: string;
  providerModelId: string;
  name: string;
  description: string;
  mediaKind: string;
  contextWindow: number | null;
  maxTokens: number | null;
  flags: {
    reasoning: boolean;
    fast: boolean;
  };
  tasks: StudioTask[];
  pricing: {
    priceVersionId: string;
    dimension: ActivePrice["pricingDimension"];
    unitQuantity: number;
  };
};

export type StudioModelDiscoveryResult = {
  task: StudioTask;
  defaultModelId: string | null;
  models: PublicStudioModel[];
};

function capabilityRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function positiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) > 0
    ? Number(value)
    : null;
}

const PROVIDER_ORDER = new Map(
  ["BYTEPLUS", "GROQ", "GEMINI", "CLOUDFLARE", "NVIDIA"].map(
    (provider, index) => [provider, index],
  ),
);

export function selectDiscoverableStudioModels(
  rows: readonly StudioModelRow[],
  task: StudioTask,
  environment: ProviderEnvironment = process.env,
): StudioModelDiscoveryResult {
  const preferredProviderModelId =
    STUDIO_TASK_DEFAULT_PROVIDER_MODEL_IDS[task] ?? null;

  const models = rows.flatMap((row): PublicStudioModel[] => {
    const price = row.priceVersions[0];
    const capabilities = capabilityRecord(row.capabilities);
    const descriptor = {
      id: row.providerModelId,
      provider: row.provider,
      mediaKind: row.mediaKind,
      capabilities: capabilities as Record<string, boolean | number | string>,
    };

    if (
      !row.enabled ||
      !price ||
      !supportsStudioTask(descriptor, task) ||
      !getProviderRuntimeReadiness(
        {
          provider: row.provider,
          mediaKind: row.mediaKind,
          providerModelId: row.providerModelId,
        },
        environment,
      ).configured
    ) {
      return [];
    }

    return [
      {
        id: row.id,
        provider: row.provider,
        providerModelId: row.providerModelId,
        name: row.displayName,
        description: row.description,
        mediaKind: row.mediaKind,
        contextWindow: positiveInteger(capabilities.contextWindow),
        maxTokens: positiveInteger(capabilities.maxTokens),
        flags: {
          reasoning: capabilities.reasoning === true,
          fast: capabilities.fast === true || capabilities.flash === true,
        },
        tasks: listStudioTasksForModel(descriptor),
        pricing: {
          priceVersionId: price.id,
          dimension: price.pricingDimension,
          unitQuantity: price.unitQuantity,
        },
      },
    ];
  });

  models.sort((left, right) => {
    const leftPreferred =
      left.providerModelId === preferredProviderModelId ? 0 : 1;
    const rightPreferred =
      right.providerModelId === preferredProviderModelId ? 0 : 1;
    if (leftPreferred !== rightPreferred) return leftPreferred - rightPreferred;

    const name = left.name.localeCompare(right.name);
    if (name !== 0) return name;

    const providerOrder =
      (PROVIDER_ORDER.get(left.provider) ?? 99) -
      (PROVIDER_ORDER.get(right.provider) ?? 99);
    if (providerOrder !== 0) return providerOrder;
    return left.providerModelId.localeCompare(right.providerModelId);
  });

  return {
    task,
    defaultModelId: models[0]?.id ?? null,
    models,
  };
}

export async function getAvailableStudioModels(
  task: StudioTask,
  options: {
    now?: Date;
    environment?: ProviderEnvironment;
  } = {},
): Promise<StudioModelDiscoveryResult> {
  const now = options.now ?? new Date();
  const rows = await db.providerModel.findMany({
    where: {
      enabled: true,
      priceVersions: {
        some: {
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
      },
    },
    select: {
      id: true,
      provider: true,
      providerModelId: true,
      displayName: true,
      description: true,
      mediaKind: true,
      enabled: true,
      capabilities: true,
      priceVersions: {
        where: {
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        orderBy: { effectiveFrom: "desc" },
        take: 1,
        select: {
          id: true,
          pricingDimension: true,
          unitQuantity: true,
        },
      },
    },
  });

  return selectDiscoverableStudioModels(
    rows as StudioModelRow[],
    task,
    options.environment,
  );
}

export class StudioModelUnavailableError extends Error {
  override readonly name = "StudioModelUnavailableError";
}

export function selectStudioModelBySelection(
  discovery: StudioModelDiscoveryResult,
  selection: string,
): PublicStudioModel {
  const canonical = discovery.models.find((model) => model.id === selection);
  if (canonical) return canonical;

  const legacyMatches = discovery.models.filter(
    (model) => model.providerModelId === selection,
  );
  if (legacyMatches.length === 1) return legacyMatches[0]!;
  if (legacyMatches.length > 1) {
    throw new StudioModelUnavailableError(
      "This legacy model selection is ambiguous. Choose the model again.",
    );
  }
  throw new StudioModelUnavailableError(
    "The selected model is unavailable for this Studio task.",
  );
}

export async function resolveStudioModelSelection(
  selection: string,
  task: StudioTask,
  options: {
    now?: Date;
    environment?: ProviderEnvironment;
  } = {},
): Promise<PublicStudioModel> {
  const canonical = await db.providerModel.findUnique({
    where: { id: selection },
    select: { id: true },
  });

  if (canonical) {
    // Never reinterpret a known canonical id as a legacy upstream id if the
    // model later becomes disabled, unpriced, unconfigured, or task-ineligible.
    return resolveAvailableStudioModel(selection, task, options);
  }

  const available = await getAvailableStudioModels(task, options);
  return selectStudioModelBySelection(available, selection);
}

export async function resolveAvailableStudioModel(
  modelId: string,
  task: StudioTask,
  options: {
    now?: Date;
    environment?: ProviderEnvironment;
  } = {},
): Promise<PublicStudioModel> {
  const now = options.now ?? new Date();
  const row = await db.providerModel.findUnique({
    where: { id: modelId },
    select: {
      id: true,
      provider: true,
      providerModelId: true,
      displayName: true,
      description: true,
      mediaKind: true,
      enabled: true,
      capabilities: true,
      priceVersions: {
        where: {
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        orderBy: { effectiveFrom: "desc" },
        take: 1,
        select: {
          id: true,
          pricingDimension: true,
          unitQuantity: true,
        },
      },
    },
  });

  if (!row) throw new StudioModelUnavailableError("Model is unavailable.");

  const result = selectDiscoverableStudioModels(
    [row as StudioModelRow],
    task,
    options.environment,
  );
  const model = result.models[0];
  if (!model) {
    throw new StudioModelUnavailableError(
      "Model is unavailable for this Studio task.",
    );
  }
  return model;
}
