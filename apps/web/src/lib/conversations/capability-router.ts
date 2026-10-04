import { db } from "@aiwa/db";
import { capabilityValues } from "../studio-model-capabilities";
import type { CreativeModality } from "./types";

export interface CapabilityRoutingInput {
  modality: CreativeModality;
  currentModelId?: string | null;
  requiredAspectRatio?: string;
  requiredResolution?: string;
  requireReferenceImages?: boolean;
}

export interface ModelRoutingResult {
  modelId: string;
  providerModelId: string;
  displayName: string;
  provider: string;
  priceVersionId: string;
}

export async function findCompatibleAlternativeModel(
  input: CapabilityRoutingInput,
): Promise<ModelRoutingResult | null> {
  const now = new Date();
  const mediaKind = input.modality;

  // Fetch all enabled models for this modality with active price versions
  const candidateModels = await db.providerModel.findMany({
    where: {
      mediaKind,
      enabled: true,
      priceVersions: {
        some: {
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
      },
    },
    include: {
      priceVersions: {
        where: {
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        orderBy: { effectiveFrom: "desc" },
        take: 1,
      },
    },
  });

  const matchingCandidates = candidateModels.filter((model) => {
    // Exclude current model if specified
    if (
      input.currentModelId &&
      (model.id === input.currentModelId ||
        model.providerModelId === input.currentModelId)
    ) {
      return false;
    }

    const caps = (model.capabilities as Record<string, unknown>) ?? {};

    // Check required aspect ratio
    if (input.requiredAspectRatio) {
      const supportedRatios = capabilityValues(
        caps as Record<string, boolean | number | string>,
        "aspectRatio",
      );
      if (
        supportedRatios.length > 0 &&
        !supportedRatios.includes(input.requiredAspectRatio)
      ) {
        return false;
      }
    }

    // Check required resolution
    if (input.requiredResolution) {
      const supportedResolutions = capabilityValues(
        caps as Record<string, boolean | number | string>,
        "resolution",
      );
      if (
        supportedResolutions.length > 0 &&
        !supportedResolutions.includes(input.requiredResolution)
      ) {
        return false;
      }
    }

    // Check reference image support
    if (input.requireReferenceImages) {
      if (caps.referenceImages !== true) {
        return false;
      }
    }

    return true;
  });

  if (matchingCandidates.length === 0) {
    return null;
  }

  // Pick the first suitable alternate
  const selected = matchingCandidates[0]!;
  const price = selected.priceVersions[0]!;

  return {
    modelId: selected.id,
    providerModelId: selected.providerModelId,
    displayName: selected.displayName,
    provider: selected.provider,
    priceVersionId: price.id,
  };
}
