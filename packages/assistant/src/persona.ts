import { db } from "@aiwa/db";
import { ASSISTANT_PERSONA_TAG, PIXEL_SYSTEM_PROMPT } from "./system-prompt";
import { getAssistantSettings } from "./settings";

function effectivePrompt(override: string | null): string {
  return override
    ? `${PIXEL_SYSTEM_PROMPT}\n\nAdministrator instructions:\n${override}`
    : PIXEL_SYSTEM_PROMPT;
}

export async function getOrCreateAssistantPersona(
  organizationId: string,
  createdById: string,
) {
  const settings = await getAssistantSettings();
  const model = settings.providerModel;
  if (!model) throw new Error("Pixel has no configured text model.");

  const existing = await db.persona.findFirst({
    where: { organizationId, tag: ASSISTANT_PERSONA_TAG },
    select: {
      id: true,
      name: true,
      tag: true,
      voiceKey: true,
      modelId: true,
      providerModelRecordId: true,
      systemPrompt: true,
    },
  });

  const prompt = effectivePrompt(settings.systemPromptOverride);
  if (existing) {
    if (
      existing.modelId !== model.providerModelId ||
      existing.providerModelRecordId !== model.id ||
      existing.systemPrompt !== prompt
    ) {
      return db.persona.update({
        where: { id: existing.id },
        data: {
          modelId: model.providerModelId,
          providerModelRecordId: model.id,
          systemPrompt: prompt,
        },
        select: {
          id: true,
          name: true,
          tag: true,
          voiceKey: true,
          modelId: true,
          providerModelRecordId: true,
          systemPrompt: true,
        },
      });
    }
    return existing;
  }

  return db.persona.create({
    data: {
      organizationId,
      name: "Pixel",
      tag: ASSISTANT_PERSONA_TAG,
      description: "Creative mascot and AI assistant for Aiwa Creator",
      systemPrompt: prompt,
      voiceKey: "charlotte",
      modelId: model.providerModelId,
      providerModelRecordId: model.id,
      isPreset: true,
      createdById,
    },
    select: {
      id: true,
      name: true,
      tag: true,
      voiceKey: true,
      modelId: true,
      providerModelRecordId: true,
      systemPrompt: true,
    },
  });
}

export async function getOrCreateAssistantThread(
  organizationId: string,
  userId: string,
) {
  const persona = await getOrCreateAssistantPersona(organizationId, userId);
  const settings = await getAssistantSettings();
  const model = settings.providerModel;
  if (!model) throw new Error("Pixel has no configured text model.");

  const existing = await db.chatThread.findFirst({
    where: {
      organizationId,
      createdById: userId,
      personaId: persona.id,
    },
    select: {
      id: true,
      personaId: true,
      modelId: true,
      providerModelRecordId: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    const thread =
      existing.modelId === model.providerModelId &&
      existing.providerModelRecordId === model.id
        ? existing
        : await db.chatThread.update({
            where: { id: existing.id },
            data: {
              modelId: model.providerModelId,
              providerModelRecordId: model.id,
              systemPrompt: effectivePrompt(settings.systemPromptOverride),
            },
            select: {
              id: true,
              personaId: true,
              modelId: true,
              providerModelRecordId: true,
            },
          });
    return { thread, persona, settings };
  }

  const thread = await db.chatThread.create({
    data: {
      organizationId,
      createdById: userId,
      personaId: persona.id,
      title: "Pixel Assistant",
      modelId: model.providerModelId,
      providerModelRecordId: model.id,
      systemPrompt: effectivePrompt(settings.systemPromptOverride),
    },
    select: {
      id: true,
      personaId: true,
      modelId: true,
      providerModelRecordId: true,
    },
  });

  return { thread, persona, settings };
}
