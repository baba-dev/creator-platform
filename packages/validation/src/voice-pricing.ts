export function assertVoicePricingDimensionMatchesCapabilities(
  mediaKind: string,
  capabilities: unknown,
  pricingDimension: string,
): void {
  if (mediaKind !== "VOICE") return;

  const value =
    capabilities &&
    typeof capabilities === "object" &&
    !Array.isArray(capabilities)
      ? (capabilities as Record<string, unknown>)
      : {};

  if (value.transcription === true) {
    if (pricingDimension !== "SECOND" && pricingDimension !== "REQUEST") {
      throw new Error(
        "Transcription models require SECOND or REQUEST pricing.",
      );
    }
    return;
  }

  if (value.audioGeneration === true) {
    if (pricingDimension !== "SECOND") {
      throw new Error("Audio generation models require SECOND pricing.");
    }
    return;
  }

  if (pricingDimension !== "CHARACTER" && pricingDimension !== "REQUEST") {
    throw new Error(
      "Speech synthesis models require CHARACTER or REQUEST pricing.",
    );
  }
}
