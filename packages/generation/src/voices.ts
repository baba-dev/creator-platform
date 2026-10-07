export const DEFAULT_PRESET_VOICE_KEY = "russell";

export interface PresetVoice {
  readonly key: string;
  readonly speakerId: string;
  readonly displayName: string;
  readonly locale: string;
  readonly language: string;
  readonly scenario?: string;
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
  readonly scenario?: string;
  readonly style?: string;
  readonly gender?: "female" | "male";
  readonly supportedModels: readonly string[];
  readonly previewUrl?: string;
}

/**
 * Server-owned catalogue of verified BytePlus Seed-TTS 2.0 preset voices.
 * Keep neutral general-purpose voices first so fallback selection is predictable.
 * Never expose raw provider speaker IDs to browser bundles or client requests.
 */
export const VERIFIED_PRESET_VOICES: readonly PresetVoice[] = [
  {
    key: "russell",
    speakerId: "en_male_russell_uranus_bigtts",
    displayName: "Russell",
    locale: "en-US",
    language: "English (US)",
    scenario: "General",
    style: "Natural, sincere & approachable",
    gender: "male",
    supportedModels: ["seed-tts-2.0"],
    enabled: true,
  },
  {
    key: "tim",
    speakerId: "en_male_tim_uranus_bigtts",
    displayName: "Tim",
    locale: "en-US",
    language: "English (US)",
    scenario: "General",
    style: "Clear, versatile & friendly",
    gender: "male",
    supportedModels: ["seed-tts-2.0"],
    enabled: true,
  },
  {
    key: "dacey",
    speakerId: "en_female_dacey_uranus_bigtts",
    displayName: "Dacey",
    locale: "en-US",
    language: "English (US)",
    scenario: "General",
    style: "Crisp, confident & engaging",
    gender: "female",
    supportedModels: ["seed-tts-2.0"],
    enabled: true,
  },
  {
    key: "joanne",
    speakerId: "en_female_joanne_uranus_bigtts",
    displayName: "Joanne",
    locale: "en-US",
    language: "English (US)",
    scenario: "General",
    style: "Natural, lively & conversational",
    gender: "female",
    supportedModels: ["seed-tts-2.0"],
    enabled: true,
  },
  {
    key: "skye",
    speakerId: "en_female_skye_uranus_bigtts",
    displayName: "Skye",
    locale: "en-US",
    language: "English (US)",
    scenario: "General",
    style: "Clear, candid & sincere",
    gender: "female",
    supportedModels: ["seed-tts-2.0"],
    enabled: true,
  },
  {
    key: "jimmy",
    speakerId: "en_male_jimmy_uranus_bigtts",
    displayName: "Jimmy",
    locale: "en-US",
    language: "English (US)",
    scenario: "General",
    style: "Natural, smooth & easygoing",
    gender: "male",
    supportedModels: ["seed-tts-2.0"],
    enabled: true,
  },
  {
    key: "adrian",
    speakerId: "en_male_bruce_uranus_bigtts",
    displayName: "Adrian",
    locale: "en-US",
    language: "English (US)",
    scenario: "General",
    style: "Composed, restrained & level-headed",
    gender: "male",
    supportedModels: ["seed-tts-2.0"],
    enabled: true,
  },
  {
    key: "alex",
    speakerId: "en_male_alex_uranus_bigtts",
    displayName: "Alex",
    locale: "en-US",
    language: "English (US)",
    scenario: "General",
    style: "Warm, clear & composed",
    gender: "male",
    supportedModels: ["seed-tts-2.0"],
    enabled: true,
  },
  {
    key: "margaret",
    speakerId: "en_female_authoritative-informative_uranus_bigtts",
    displayName: "Margaret",
    locale: "en-US",
    language: "English (US)",
    scenario: "General",
    style: "Gentle, sincere & unhurried",
    gender: "female",
    supportedModels: ["seed-tts-2.0"],
    enabled: true,
  },
  {
    key: "marcus",
    speakerId: "en_male_marcus_uranus_bigtts",
    displayName: "Marcus",
    locale: "en-US",
    language: "English (US)",
    scenario: "General",
    style: "Mellow, deep & narrative",
    gender: "male",
    supportedModels: ["seed-tts-2.0"],
    enabled: true,
  },
  {
    key: "jasper",
    speakerId: "en_male_excited-male-voice_uranus_bigtts",
    displayName: "Jasper",
    locale: "en-US",
    language: "English (US)",
    scenario: "Entertainment",
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
    scenario: "Education",
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
    scenario: "Role play",
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
    scenario: "Education",
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
    scenario: "Education",
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
    scenario: "Narration",
    style: "Gentle & calm",
    gender: "female",
    supportedModels: ["seed-tts-2.0"],
    enabled: true,
  },
  {
    key: "dina",
    speakerId: "ar_female_dina_uranus_bigtts",
    displayName: "Dina",
    locale: "ar-EG",
    language: "Arabic (Egyptian)",
    scenario: "General",
    style: "Warm, lively & conversational",
    gender: "female",
    supportedModels: ["seed-tts-2.0"],
    enabled: true,
  },
  {
    key: "youssef",
    speakerId: "ar_male_youssef_uranus_bigtts",
    displayName: "Youssef",
    locale: "ar-EG",
    language: "Arabic (Egyptian)",
    scenario: "General",
    style: "Calm, easygoing & intimate",
    gender: "male",
    supportedModels: ["seed-tts-2.0"],
    enabled: true,
  },
  {
    key: "vivi",
    speakerId: "zh_female_vv_uranus_bigtts",
    displayName: "Vivi",
    locale: "zh-CN",
    language: "Chinese (Mandarin)",
    scenario: "General",
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
    scenario: "General",
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

export function resolvePresetVoice(
  voiceKey: string,
  modelId?: string,
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

  if (modelId && !voice.supportedModels.includes(modelId)) {
    throw new VoiceResolutionError(
      "Selected voice is not compatible with this model.",
      "INCOMPATIBLE_VOICE",
    );
  }

  return voice;
}

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
    scenario: voice.scenario,
    style: voice.style,
    gender: voice.gender,
    supportedModels: voice.supportedModels,
    previewUrl: voice.previewUrl,
  }));
}
