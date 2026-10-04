export type QuickCreateMediaKind = "IMAGE" | "VIDEO" | "VOICE";

type QuickCreateModelLike = {
  providerModelId: string;
  capabilities?: Record<string, unknown> | null;
};

const QUICK_CREATE_PREFERRED_PROVIDER_MODEL_IDS = {
  IMAGE: [
    "seedream-5-0-260128",
    "seedream-4-5-251128",
    "dola-seedream-5-0-pro-260628",
    "seedream-4-0-250828",
  ],
  VIDEO: [
    "dreamina-seedance-2-0-fast-260128",
    "dreamina-seedance-2-0-mini-260615",
    "dreamina-seedance-2-0-260128",
    "dreamina-seedance-2-5-260628",
  ],
  VOICE: ["seed-tts-2.0"],
} as const satisfies Record<QuickCreateMediaKind, readonly string[]>;

function isQuickCreateCompatible(
  model: QuickCreateModelLike,
  mediaKind: QuickCreateMediaKind,
): boolean {
  if (mediaKind !== "VIDEO") return true;

  // Quick Create has no source-upload controls, so source-only talking-avatar
  // models must never become its implicit video default.
  return model.capabilities?.talkingAvatar !== true;
}

export function selectQuickCreateModel<T extends QuickCreateModelLike>(
  models: readonly T[],
  mediaKind: QuickCreateMediaKind,
): T | undefined {
  const compatibleModels = models.filter((model) =>
    isQuickCreateCompatible(model, mediaKind),
  );

  for (const providerModelId of QUICK_CREATE_PREFERRED_PROVIDER_MODEL_IDS[
    mediaKind
  ]) {
    const preferred = compatibleModels.find(
      (model) => model.providerModelId === providerModelId,
    );
    if (preferred) return preferred;
  }

  return compatibleModels[0];
}
