import { z } from "zod";

/**
 * Locale is audience/output intent, not the user's interface language.
 * Flag presets are UX shortcuts; language and tone are independent controls.
 */
export const CREATIVE_LOCALE_PRESETS = [
  {
    id: "auto",
    flag: "🌐",
    name: "Auto",
    countryCode: null,
    accent: null,
    languages: [{ code: "auto", label: "Auto-detect" }],
  },
  {
    id: "oman",
    flag: "🇴🇲",
    name: "Oman",
    countryCode: "OM",
    accent: "Omani / Gulf Arabic",
    languages: [
      { code: "ar-OM", label: "Arabic (Oman)" },
      { code: "en-OM", label: "English (Oman)" },
    ],
  },
  {
    id: "uae",
    flag: "🇦🇪",
    name: "UAE",
    countryCode: "AE",
    accent: "Emirati / Gulf Arabic",
    languages: [
      { code: "ar-AE", label: "Arabic (UAE)" },
      { code: "en-AE", label: "English (UAE)" },
    ],
  },
  {
    id: "saudi",
    flag: "🇸🇦",
    name: "Saudi Arabia",
    countryCode: "SA",
    accent: "Saudi Arabic",
    languages: [
      { code: "ar-SA", label: "Arabic (Saudi)" },
      { code: "en-SA", label: "English (Saudi)" },
    ],
  },
  {
    id: "egypt",
    flag: "🇪🇬",
    name: "Egypt",
    countryCode: "EG",
    accent: "Egyptian Arabic",
    languages: [
      { code: "ar-EG", label: "Arabic (Egypt)" },
      { code: "en-EG", label: "English (Egypt)" },
    ],
  },
  {
    id: "india",
    flag: "🇮🇳",
    name: "India",
    countryCode: "IN",
    accent: "Indian English / Hindi",
    languages: [
      { code: "en-IN", label: "English (India)" },
      { code: "hi-IN", label: "Hindi" },
    ],
  },
  {
    id: "uk",
    flag: "🇬🇧",
    name: "United Kingdom",
    countryCode: "GB",
    accent: "British English",
    languages: [{ code: "en-GB", label: "English (UK)" }],
  },
  {
    id: "usa",
    flag: "🇺🇸",
    name: "United States",
    countryCode: "US",
    accent: "American English",
    languages: [{ code: "en-US", label: "English (US)" }],
  },
  {
    id: "france",
    flag: "🇫🇷",
    name: "France",
    countryCode: "FR",
    accent: "French",
    languages: [{ code: "fr-FR", label: "French" }],
  },
  {
    id: "germany",
    flag: "🇩🇪",
    name: "Germany",
    countryCode: "DE",
    accent: "German",
    languages: [{ code: "de-DE", label: "German" }],
  },
  {
    id: "spain",
    flag: "🇪🇸",
    name: "Spain",
    countryCode: "ES",
    accent: "European Spanish",
    languages: [{ code: "es-ES", label: "Spanish (Spain)" }],
  },
  {
    id: "brazil",
    flag: "🇧🇷",
    name: "Brazil",
    countryCode: "BR",
    accent: "Brazilian Portuguese",
    languages: [{ code: "pt-BR", label: "Portuguese (Brazil)" }],
  },
  {
    id: "japan",
    flag: "🇯🇵",
    name: "Japan",
    countryCode: "JP",
    accent: "Japanese",
    languages: [{ code: "ja-JP", label: "Japanese" }],
  },
] as const;

export const creativeLocalePresetSchema = z.enum([
  "auto",
  "oman",
  "uae",
  "saudi",
  "egypt",
  "india",
  "uk",
  "usa",
  "france",
  "germany",
  "spain",
  "brazil",
  "japan",
]);
export const creativeLocaleToneSchema = z.enum([
  "natural",
  "casual",
  "professional",
  "energetic",
  "warm",
  "luxury",
  "authoritative",
]);
export const creativeLocaleIntentSchema = z
  .object({
    preset: creativeLocalePresetSchema,
    language: z.string().trim().min(2).max(16),
    tone: creativeLocaleToneSchema,
    culturalContext: z.enum(["auto", "on", "off"]),
  })
  .strict()
  .superRefine((intent, ctx) => {
    const preset = CREATIVE_LOCALE_PRESETS.find(
      (item) => item.id === intent.preset,
    );
    if (!preset?.languages.some((item) => item.code === intent.language)) {
      ctx.addIssue({
        code: "custom",
        path: ["language"],
        message: "Language is not available for this locale preset.",
      });
    }
  });

export type CreativeLocaleIntent = z.infer<typeof creativeLocaleIntentSchema>;
export const DEFAULT_CREATIVE_LOCALE: CreativeLocaleIntent = {
  preset: "auto",
  language: "auto",
  tone: "natural",
  culturalContext: "auto",
};

export function normalizeCreativeLocaleIntent(input: CreativeLocaleIntent) {
  const validated = creativeLocaleIntentSchema.parse(input);
  const preset = CREATIVE_LOCALE_PRESETS.find(
    (item) => item.id === validated.preset,
  )!;
  return {
    ...validated,
    locale: validated.language,
    countryCode: preset.countryCode,
    accent: preset.accent,
    catalogVersion: 1,
  };
}

/** Capability negotiation MUST NOT pretend that a voice accent is native. */
export function creativeLocaleCapabilities(
  mediaKind: "IMAGE" | "VIDEO" | "VOICE" | "TEXT",
  capabilities: Record<string, unknown> = {},
) {
  return {
    language:
      mediaKind === "VOICE" && capabilities.supportsLocale === false
        ? "unavailable"
        : "metadata",
    accent:
      mediaKind === "VOICE" && capabilities.supportsAccent === true
        ? "native"
        : "metadata",
    culturalContext:
      mediaKind === "IMAGE" || mediaKind === "VIDEO" || mediaKind === "TEXT",
  } as const;
}

/** For provider-specific callers. Never mutate the original user prompt. */
export function compileCreativeLocaleInstructions(
  intent: CreativeLocaleIntent | undefined,
  kind: "IMAGE" | "VIDEO" | "VOICE" | "TEXT",
): string {
  if (!intent) return "";
  if (intent.preset === "auto") {
    return intent.tone === "natural"
      ? ""
      : `Requested tone: ${intent.tone}. Explicit user instructions take precedence.`;
  }
  const resolved = normalizeCreativeLocaleIntent(intent);
  const locale = CREATIVE_LOCALE_PRESETS.find(
    (item) => item.id === intent.preset,
  )!;
  const output = [
    "Target audience locale: " + locale.name + " (" + resolved.locale + ").",
  ];
  if (kind === "TEXT" || kind === "VOICE" || kind === "VIDEO") {
    output.push(
      "Use the selected language and appropriate spelling/linguistic register where speech or text is requested.",
    );
  }
  if (kind === "VOICE" || kind === "VIDEO") {
    output.push(
      "Only use regional pronunciation if the selected model/voice truly supports it; do not misrepresent accent support.",
    );
  }
  if (intent.tone !== "natural")
    output.push("Requested tone: " + intent.tone + ".");
  if (
    intent.culturalContext !== "off" &&
    (kind === "IMAGE" || kind === "VIDEO" || kind === "TEXT")
  ) {
    output.push(
      "Use culturally relevant details " +
        (intent.culturalContext === "on"
          ? "when appropriate"
          : "only where the request calls for them") +
        "; do not add stereotypes, landmarks, or costumes without a reason.",
    );
  }
  output.push(
    "Explicit user instructions and original references take precedence.",
  );
  return output.join(" ");
}

/**
 * Parse the durable locale snapshot: jobs include catalog-derived fields which
 * aren't accepted in the public strict request schema. Never trust unknown JSON.
 */
export function readCreativeLocaleIntent(
  value: unknown,
): CreativeLocaleIntent | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  const parsed = creativeLocaleIntentSchema.safeParse({
    preset: record.preset,
    language: record.language,
    tone: record.tone,
    culturalContext: record.culturalContext,
  });
  return parsed.success ? parsed.data : undefined;
}

/**
 * Compile once at provider dispatch, never into editable prompt history.
 * If a provider has a strict prompt limit, do not truncate the user's text.
 */
export function compileCreativeLocaleMediaPrompt(
  prompt: string,
  persistedIntent: unknown,
  kind: "IMAGE" | "VIDEO" | "VOICE",
  maxLength = 2000,
): string {
  const intent = readCreativeLocaleIntent(persistedIntent);
  const instruction = compileCreativeLocaleInstructions(intent, kind);
  if (!instruction) return prompt;
  const compiled = `${prompt}\n\n[Creative locale guidance]\n${instruction}`;
  return compiled.length <= maxLength ? compiled : prompt;
}

/** Only rank verified voices. Same-language voices aren't marketed as regional accents. */
export function voiceLocaleMatch(
  voiceLocale: string,
  requestedLocale: string,
): "exact" | "language" | "unverified" {
  if (requestedLocale === "auto") return "unverified";
  if (voiceLocale.toLowerCase() === requestedLocale.toLowerCase())
    return "exact";
  if (
    voiceLocale.split("-")[0]?.toLowerCase() ===
    requestedLocale.split("-")[0]?.toLowerCase()
  ) {
    return "language";
  }
  return "unverified";
}

export function sortVoicesForLocale<T extends { key: string; locale: string }>(
  voices: readonly T[],
  persistedIntent: unknown,
): T[] {
  const intent = readCreativeLocaleIntent(persistedIntent);
  if (!intent || intent.language === "auto") return [...voices];
  const rank = { exact: 0, language: 1, unverified: 2 };
  return [...voices].sort(
    (a, b) =>
      rank[voiceLocaleMatch(a.locale, intent.language)] -
      rank[voiceLocaleMatch(b.locale, intent.language)],
  );
}

/** One ephemeral system turn, not another copy in every conversation user turn. */
export function localeSystemMessages<
  T extends { role: "system" | "user" | "assistant"; content: string },
>(
  messages: readonly T[],
  persistedIntent: unknown,
): Array<T | { role: "system"; content: string }> {
  const intent = readCreativeLocaleIntent(persistedIntent);
  const instruction = compileCreativeLocaleInstructions(intent, "TEXT");
  if (!instruction) return [...messages];
  return [
    {
      role: "system",
      content: `Creative locale metadata for this response only. ${instruction}`,
    },
    ...messages,
  ];
}

/** Transcription providers typically accept a language code without a region. */
export function transcriptionLanguageHint(
  rawLanguage: unknown,
  persistedIntent: unknown,
): string | undefined {
  if (typeof rawLanguage === "string" && rawLanguage.trim()) return rawLanguage;
  const intent = readCreativeLocaleIntent(persistedIntent);
  if (!intent || intent.language === "auto") return undefined;
  const base = intent.language.split("-")[0]?.toLowerCase();
  return base && /^[a-z]{2,3}$/.test(base) ? base : undefined;
}

/**
 * Prompt enhancement sees locale as a separate system instruction, never as
 * repeated user prompt text. The same result is used for preflight costing.
 */
export function creativeLocaleEnhancementSystemPrompt(
  baseSystemPrompt: string,
  persistedIntent: unknown,
  kind: "IMAGE" | "VIDEO",
): string {
  const intent = readCreativeLocaleIntent(persistedIntent);
  const direction = compileCreativeLocaleInstructions(intent, kind);
  if (!direction) return baseSystemPrompt;
  return [
    baseSystemPrompt,
    direction,
    "Locale is metadata for downstream generation, not text to pad the rewritten prompt. Keep the enhanced prompt natural; do not add repetitive regional or cultural descriptions unless explicitly requested.",
  ].join(" ");
}
