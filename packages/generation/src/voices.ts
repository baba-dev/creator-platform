export interface PresetVoice {
  readonly key: string;
  readonly speakerId: string;
  readonly displayName: string;
  readonly locale: string; // BCP 47 (e.g. en-US, en-GB, zh-CN)
  readonly language: string;
  readonly style?: string;
  readonly gender?: "female" | "male";
  readonly supportedModels: readonly string[];
  readonly enabled: boolean;
  readonly previewUrl?: string;
}

export interface PublicVoiceMetadata {
  readonly key: string;
  readonly displayName: string;
  readonly locale: string;
  readonly language: string;
  readonly style?: string;
  readonly gender?: "female" | "male";
  readonly supportedModels: readonly string[];
  readonly previewUrl?: string;
}

/**
 * Server-owned catalogue of verified BytePlus Seed-TTS 2.0 preset voices.
 * Verified against official BytePlus Seed Speech documentation and speaker IDs.
 * Never expose raw speaker IDs to browser bundles or client requests.
 */
export const VERIFIED_PRESET_VOICES: readonly PresetVoice[] = [
  {
    key: "jasper",
    speakerId: "en_male_excited-male-voice_uranus_bigtts",
    displayName: "Jasper",
    locale: "en-US",
    language: "English (US)",
    style: "Passionate & high-spirited",
    gender: "male",
    supportedModels: ["seed-tts-2.0"],
    enabled: true,
  },
  {
    key: "charlotte",
    speakerId: "en_female_authoritative-british_uranus_bigtts",
    displayName: "Charlotte",
    locale: "en-GB",
    language: "English (UK)",
    style: "Bright & crisp",
    gender: "female",
    supportedModels: ["seed-tts-2.0"],
    enabled: true,
  },
  {
    key: "kayla",
    speakerId: "en_female_xinwenjieshuonv_uranus_bigtts",
    displayName: "Kayla",
    locale: "en-US",
    language: "English (US)",
    style: "Enthusiastic & outgoing",
    gender: "female",
    supportedModels: ["seed-tts-2.0"],
    enabled: true,
  },
  {
    key: "sunny",
    speakerId: "en_female_myra_cmb_uranus_bigtts",
    displayName: "Sunny",
    locale: "en-US",
    language: "English (US)",
    style: "Crisp & lively",
    gender: "female",
    supportedModels: ["seed-tts-2.0"],
    enabled: true,
  },
  {
    key: "zendaya",
    speakerId: "en_female_zendaya_p1_uranus_bigtts",
    displayName: "Zendaya",
    locale: "en-US",
    language: "English (US)",
    style: "Relaxed & approachable",
    gender: "female",
    supportedModels: ["seed-tts-2.0"],
    enabled: true,
  },
  {
    key: "sharron",
    speakerId: "en_female_sharron_uranus_bigtts",
    displayName: "Sharron",
    locale: "en-US",
    language: "English (US)",
    style: "Gentle & calm",
    gender: "female",
    supportedModels: ["seed-tts-2.0"],
    enabled: true,
  },
  {
    key: "vivi",
    speakerId: "zh_female_vv_uranus_bigtts",
    displayName: "Vivi",
    locale: "zh-CN",
    language: "Chinese (Mandarin)",
    style: "Youthful & vibrant",
    gender: "female",
    supportedModels: ["seed-tts-2.0"],
    enabled: true,
  },
  {
    key: "xiaohe",
    speakerId: "zh_female_xiaohe_uranus_bigtts",
    displayName: "Xiaohe",
    locale: "zh-CN",
    language: "Chinese (Mandarin)",
    style: "Warm & natural",
    gender: "female",
    supportedModels: ["seed-tts-2.0"],
    enabled: true,
  },
] as const;

export class VoiceResolutionError extends Error {
  constructor(
    message: string,
    public readonly code: string = "INVALID_VOICE",
  ) {
    super(message);
    this.name = "VoiceResolutionError";
  }
}

/**
 * Resolves a client-supplied voice key to its verified provider speaker ID.
 * Ensures the voice exists, is enabled, and is compatible with the requested model.
 */
export function resolvePresetVoice(
  voiceKey: string,
  modelId: string,
): PresetVoice {
  const normalizedKey = voiceKey.trim().toLowerCase();
  const voice = VERIFIED_PRESET_VOICES.find(
    (item) => item.key.toLowerCase() === normalizedKey,
  );

  if (!voice || !voice.enabled) {
    throw new VoiceResolutionError(
      "Selected voice is unknown or unavailable.",
      "UNKNOWN_VOICE",
    );
  }

  if (!voice.supportedModels.includes(modelId)) {
    throw new VoiceResolutionError(
      "Selected voice is not compatible with this model.",
      "INCOMPATIBLE_VOICE",
    );
  }

  return voice;
}

/**
 * Returns safe metadata for all enabled voices, filterable by model.
 * Safe for client-facing serialization (no raw speaker IDs).
 */
export function listPublicPresetVoices(
  modelId?: string,
): readonly PublicVoiceMetadata[] {
  return VERIFIED_PRESET_VOICES.filter(
    (voice) =>
      voice.enabled && (!modelId || voice.supportedModels.includes(modelId)),
  ).map((voice) => ({
    key: voice.key,
    displayName: voice.displayName,
    locale: voice.locale,
    language: voice.language,
    style: voice.style,
    gender: voice.gender,
    supportedModels: voice.supportedModels,
    previewUrl: voice.previewUrl,
  }));
}
