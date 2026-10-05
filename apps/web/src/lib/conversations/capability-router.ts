import { db } from "@aiwa/db";
import { selectQuickCreateModel } from "../quick-create-model";
import { capabilityValues } from "../studio-model-capabilities";
import type { CreativeModality } from "./types";

export interface CapabilityRoutingInput {
  modality: CreativeModality;
  currentModelId?: string | null;
  requiredAspectRatio?: string;
  requiredResolution?: string;
  requireReferenceImages?: boolean;
  requiredOutputCount?: number;
  requireFirstFrame?: boolean;
  requireExtendVideo?: boolean;
  requireReturnLastFrame?: boolean;
  excludeCurrentModel?: boolean;
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
      provider: "BYTEPLUS",
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
      input.excludeCurrentModel === true &&
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
    if (input.requireReferenceImages && caps.referenceImages !== true) {
      return false;
    }

    if (input.requiredOutputCount && input.requiredOutputCount > 1) {
      const maxGeneratedImages =
        typeof caps.maxGeneratedImages === "number"
          ? caps.maxGeneratedImages
          : 1;
      const maxTotalImages =
        typeof caps.maxTotalInputOutputImages === "number"
          ? caps.maxTotalInputOutputImages
          : maxGeneratedImages;
      if (
        caps.sequentialImages !== true ||
        input.requiredOutputCount > maxGeneratedImages ||
        input.requiredOutputCount + (input.requireReferenceImages ? 1 : 0) >
          maxTotalImages
      ) {
        return false;
      }
    }

    if (input.requireFirstFrame && caps.firstFrame !== true) {
      return false;
    }

    if (input.requireExtendVideo && caps.extendVideo !== true) {
      return false;
    }

    if (input.requireReturnLastFrame && caps.returnLastFrame !== true) {
      return false;
    }

    return true;
  });

  if (matchingCandidates.length === 0) {
    return null;
  }

  // Preserve the current model whenever it already satisfies the requested
  // capabilities and is a general-purpose candidate for this modality.
  // In particular, source-only talking-avatar models must never become an
  // implicit conversational video target.
  if (input.currentModelId && input.excludeCurrentModel !== true) {
    const current = matchingCandidates.find(
      (model) =>
        model.id === input.currentModelId ||
        model.providerModelId === input.currentModelId,
    );
    if (current && selectQuickCreateModel([current], input.modality)) {
      const price = current.priceVersions[0]!;
      return {
        modelId: current.id,
        providerModelId: current.providerModelId,
        displayName: current.displayName,
        provider: current.provider,
        priceVersionId: price.id,
      };
    }
  }

  // Use the same verified preference order as Quick Create instead of relying
  // on database row order. This prevents regressions such as choosing
  // OmniHuman for normal video generation or an older image model before the
  // known-good defaults.
  const selected = selectQuickCreateModel(matchingCandidates, input.modality);
  if (!selected) return null;
  const price = selected.priceVersions[0]!;

  return {
    modelId: selected.id,
    providerModelId: selected.providerModelId,
    displayName: selected.displayName,
    provider: selected.provider,
    priceVersionId: price.id,
  };
}
