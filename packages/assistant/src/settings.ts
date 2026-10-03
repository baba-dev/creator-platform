import { db } from "@aiwa/db";

export interface AssistantModelConfig {
  id: string;
  provider: string;
  providerModelId: string;
  displayName: string;
  capabilities: unknown;
}

export interface AssistantConfig {
  id: string;
  providerModelRecordId: string | null;
  providerModel: AssistantModelConfig | null;
  pricingMode: "FREE" | "CHARGED";
  systemPromptOverride: string | null;
  enabled: boolean;
  updatedAt: Date;
}

const activePriceWhere = (now: Date) => ({
  effectiveFrom: { lte: now },
  OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
});

async function resolveDefaultModel() {
  const now = new Date();
  const preferred = await db.providerModel.findFirst({
    where: {
      provider: "GROQ",
      providerModelId: "openai/gpt-oss-20b",
      mediaKind: "TEXT",
      enabled: true,
      priceVersions: { some: activePriceWhere(now) },
    },
  });
  if (preferred) return preferred;
  return db.providerModel.findFirst({
    where: {
      mediaKind: "TEXT",
      enabled: true,
      priceVersions: { some: activePriceWhere(now) },
    },
    orderBy: [{ provider: "asc" }, { displayName: "asc" }],
  });
}

function toConfig(row: {
  id: string;
  providerModelRecordId: string | null;
  pricingMode: string;
  systemPromptOverride: string | null;
  enabled: boolean;
  updatedAt: Date;
  providerModel: AssistantModelConfig | null;
}): AssistantConfig {
  return {
    id: row.id,
    providerModelRecordId: row.providerModelRecordId,
    providerModel: row.providerModel,
    pricingMode: row.pricingMode === "CHARGED" ? "CHARGED" : "FREE",
    systemPromptOverride: row.systemPromptOverride,
    enabled: row.enabled,
    updatedAt: row.updatedAt,
  };
}

export async function getAssistantSettings(): Promise<AssistantConfig> {
  const existing = await db.assistantSetting.findUnique({
    where: { id: "default" },
    include: { providerModel: true },
  });
  if (existing) return toConfig(existing);

  const defaultModel = await resolveDefaultModel();
  const created = await db.assistantSetting.create({
    data: {
      id: "default",
      providerModelRecordId: defaultModel?.id ?? null,
      pricingMode: "FREE",
      enabled: true,
    },
    include: { providerModel: true },
  });
  return toConfig(created);
}

export async function updateAssistantSettings(input: {
  providerModelRecordId: string;
  pricingMode: "FREE" | "CHARGED";
  systemPromptOverride?: string | null;
  enabled?: boolean;
  updatedById?: string;
}): Promise<AssistantConfig> {
  const now = new Date();
  const model = await db.providerModel.findFirst({
    where: {
      id: input.providerModelRecordId,
      mediaKind: "TEXT",
      enabled: true,
      priceVersions: { some: activePriceWhere(now) },
    },
    select: { id: true },
  });
  if (!model) {
    throw new Error(
      "Selected assistant model is unavailable or has no active pricing.",
    );
  }

  const updated = await db.assistantSetting.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      providerModelRecordId: model.id,
      pricingMode: input.pricingMode,
      systemPromptOverride: input.systemPromptOverride ?? null,
      enabled: input.enabled ?? true,
      updatedById: input.updatedById ?? null,
    },
    update: {
      providerModelRecordId: model.id,
      pricingMode: input.pricingMode,
      systemPromptOverride:
        input.systemPromptOverride !== undefined
          ? input.systemPromptOverride
          : undefined,
      enabled: input.enabled !== undefined ? input.enabled : undefined,
      updatedById: input.updatedById ?? undefined,
    },
    include: { providerModel: true },
  });
  return toConfig(updated);
}
