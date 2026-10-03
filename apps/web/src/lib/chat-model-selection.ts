import type { PublicStudioModel } from "./studio-model-discovery";
import {
  resolveAvailableStudioModel,
  resolveStudioModelSelection,
} from "./studio-model-discovery";

export type PersistedChatModelReference = {
  modelId: string;
  providerModelRecordId: string | null;
};

export type ClientChatModelReference = {
  modelId: string;
  modelAvailable: boolean;
  modelReference: "CANONICAL" | "LEGACY" | "UNAVAILABLE";
};

export function clientChatModelReference(
  reference: PersistedChatModelReference,
  availableModels: readonly PublicStudioModel[],
): ClientChatModelReference {
  if (reference.providerModelRecordId) {
    return {
      modelId: reference.providerModelRecordId,
      modelAvailable: availableModels.some(
        (model) => model.id === reference.providerModelRecordId,
      ),
      modelReference: "CANONICAL",
    };
  }

  const legacyMatches = availableModels.filter(
    (model) => model.providerModelId === reference.modelId,
  );
  if (legacyMatches.length === 1) {
    return {
      modelId: legacyMatches[0]!.id,
      modelAvailable: true,
      modelReference: "LEGACY",
    };
  }

  return {
    modelId: reference.modelId,
    modelAvailable: false,
    modelReference: "UNAVAILABLE",
  };
}

export async function resolveRequestedChatModel(
  selection: string,
): Promise<PublicStudioModel> {
  return resolveStudioModelSelection(selection, "character-chat");
}

export async function resolvePersistedChatModel(
  reference: PersistedChatModelReference,
): Promise<PublicStudioModel> {
  if (reference.providerModelRecordId) {
    return resolveAvailableStudioModel(
      reference.providerModelRecordId,
      "character-chat",
    );
  }
  return resolveStudioModelSelection(reference.modelId, "character-chat");
}
