import { db } from "@aiwa/db";
import { parseTextUsageRatesForProvider } from "@aiwa/credits";
import { getProviderRuntimeReadiness, supportsStudioTask, STUDIO_TASK_DEFAULT_PROVIDER_MODEL_IDS } from "@aiwa/providers";
import { z } from "zod";
import type { AssistantTool } from "./types";

async function availableModels() {
  const now = new Date();
  const rows = await db.providerModel.findMany({
    where: {
      enabled: true,
      priceVersions: { some: { effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] } },
    },
    select: {
      id: true, displayName: true, provider: true, providerModelId: true, mediaKind: true, capabilities: true,
      priceVersions: {
        where: { effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
        orderBy: { effectiveFrom: "desc" }, take: 1,
        select: { pricingDimension: true, usageRates: true },
      },
    },
  });
  return rows.filter((row) => {
    const price = row.priceVersions[0];
    if (!price) return false;
    if (price.pricingDimension !== "REQUEST") {
      if (price.pricingDimension !== "TOKEN") return false;
      if (price.usageRates != null) {
        try { parseTextUsageRatesForProvider(price.usageRates, row.provider); }
        catch { return false; }
      }
    }
    const capabilities = row.capabilities && typeof row.capabilities === "object" && !Array.isArray(row.capabilities)
      ? row.capabilities as Record<string, boolean | number | string> : {};
    return supportsStudioTask({
      id: row.providerModelId, provider: row.provider, mediaKind: row.mediaKind, capabilities,
    }, "prompt-enhancement") &&
      getProviderRuntimeReadiness({
        provider: row.provider, mediaKind: row.mediaKind, providerModelId: row.providerModelId,
      }).configured;
  }).sort((a, b) => {
    const preferred = STUDIO_TASK_DEFAULT_PROVIDER_MODEL_IDS["prompt-enhancement"];
    if ((a.providerModelId === preferred) !== (b.providerModelId === preferred)) return a.providerModelId === preferred ? -1 : 1;
    return a.displayName.localeCompare(b.displayName) || a.provider.localeCompare(b.provider);
  }).map(({ id, displayName, provider, providerModelId }) => ({ id, name: displayName, provider, providerModelId }));
}

export const getPromptEnhancementModelTool: AssistantTool = {
  description: "Read the current Prompt Enhance model preference and eligible choices for this user and workspace",
  inputSchema: z.object({}).strict(),
  async execute(_input, ctx) {
    const [models, row] = await Promise.all([
      availableModels(),
      db.promptEnhancementPreference.findUnique({
        where: { organizationId_userId: { organizationId: ctx.organizationId, userId: ctx.userId } },
        select: { modelId: true },
      }),
    ]);
    const active = models.find((model) => model.id === row?.modelId) ?? models[0] ?? null;
    return { selected: active, models, savedModelUnavailable: Boolean(row && row.modelId !== active?.id) };
  },
};

const selectionSchema = z.object({
  model: z.string().trim().min(1).max(191),
}).strict();

export const setPromptEnhancementModelTool: AssistantTool<z.infer<typeof selectionSchema>> = {
  description: "Choose an available Prompt Enhance model by exact model ID, model name or unique provider; requires an explicit user request",
  inputSchema: selectionSchema,
  async execute(input, ctx) {
    const models = await availableModels();
    const query = input.model.trim().toLowerCase();
    if (["default", "reset", "automatic", "auto"].includes(query)) {
      await db.promptEnhancementPreference.deleteMany({
        where: { organizationId: ctx.organizationId, userId: ctx.userId },
      });
      return { selected: models[0] ?? null, reset: true };
    }
    const exact = models.filter((model) => [model.id, model.name, model.providerModelId, model.provider].some((value) => value.toLowerCase() === query));
    const matching = exact.length ? exact : models.filter((model) => [model.name, model.providerModelId].some((value) => value.toLowerCase().includes(query)));
    if (matching.length !== 1) return { selected: null, candidates: matching, ambiguous: matching.length > 1, unavailable: matching.length === 0 };
    const selected = matching[0]!;
    await db.promptEnhancementPreference.upsert({
      where: { organizationId_userId: { organizationId: ctx.organizationId, userId: ctx.userId } },
      create: { organizationId: ctx.organizationId, userId: ctx.userId, modelId: selected.id },
      update: { modelId: selected.id },
    });
    return { selected, reset: false };
  },
};
