import { z } from "zod";

/**
 * Locale is audience/output intent, not the user's interface language.
 * Flag presets are UX shortcuts; language and tone are independent controls.
 */
export const CREATIVE_LOCALE_PRESETS = [
  { id: "auto", flag: "🌐", name: "Auto", countryCode: null, accent: null, languages: [{ code: "auto", label: "Auto-detect" }] },
  { id: "oman", flag: "🇴🇲", name: "Oman", countryCode: "OM", accent: "Omani / Gulf Arabic", languages: [{ code: "ar-OM", label: "Arabic (Oman)" }, { code: "en-OM", label: "English (Oman)" }] },
  { id: "uae", flag: "🇦🇪", name: "UAE", countryCode: "AE", accent: "Emirati / Gulf Arabic", languages: [{ code: "ar-AE", label: "Arabic (UAE)" }, { code: "en-AE", label: "English (UAE)" }] },
  { id: "saudi", flag: "🇸🇦", name: "Saudi Arabia", countryCode: "SA", accent: "Saudi Arabic", languages: [{ code: "ar-SA", label: "Arabic (Saudi)" }, { code: "en-SA", label: "English (Saudi)" }] },
  { id: "egypt", flag: "🇪🇬", name: "Egypt", countryCode: "EG", accent: "Egyptian Arabic", languages: [{ code: "ar-EG", label: "Arabic (Egypt)" }, { code: "en-EG", label: "English (Egypt)" }] },
  { id: "india", flag: "🇮🇳", name: "India", countryCode: "IN", accent: "Indian English / Hindi", languages: [{ code: "en-IN", label: "English (India)" }, { code: "hi-IN", label: "Hindi" }] },
  { id: "uk", flag: "🇬🇧", name: "United Kingdom", countryCode: "GB", accent: "British English", languages: [{ code: "en-GB", label: "English (UK)" }] },
  { id: "usa", flag: "🇺🇸", name: "United States", countryCode: "US", accent: "American English", languages: [{ code: "en-US", label: "English (US)" }] },
  { id: "france", flag: "🇫🇷", name: "France", countryCode: "FR", accent: "French", languages: [{ code: "fr-FR", label: "French" }] },
  { id: "germany", flag: "🇩🇪", name: "Germany", countryCode: "DE", accent: "German", languages: [{ code: "de-DE", label: "German" }] },
  { id: "spain", flag: "🇪🇸", name: "Spain", countryCode: "ES", accent: "European Spanish", languages: [{ code: "es-ES", label: "Spanish (Spain)" }] },
  { id: "brazil", flag: "🇧🇷", name: "Brazil", countryCode: "BR", accent: "Brazilian Portuguese", languages: [{ code: "pt-BR", label: "Portuguese (Brazil)" }] },
  { id: "japan", flag: "🇯🇵", name: "Japan", countryCode: "JP", accent: "Japanese", languages: [{ code: "ja-JP", label: "Japanese" }] },
] as const;

export const creativeLocalePresetSchema = z.enum([
  "auto", "oman", "uae", "saudi", "egypt", "india", "uk",
  "usa", "france", "germany", "spain", "brazil", "japan",
]);
export const creativeLocaleToneSchema = z.enum([
  "natural", "casual", "professional", "energetic", "warm", "luxury", "authoritative",
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
    const preset = CREATIVE_LOCALE_PRESETS.find((item) => item.id === intent.preset);
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
  const preset = CREATIVE_LOCALE_PRESETS.find((item) => item.id === validated.preset)!;
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
    language: mediaKind === "VOICE" && capabilities.supportsLocale === false ? "unavailable" : "metadata",
    accent: mediaKind === "VOICE" && capabilities.supportsAccent === true ? "native" : "metadata",
    culturalContext: mediaKind === "IMAGE" || mediaKind === "VIDEO" || mediaKind === "TEXT",
  } as const;
}

/** For provider-specific callers. Never mutate the original user prompt. */
export function compileCreativeLocaleInstructions(
  intent: CreativeLocaleIntent | undefined,
  kind: "IMAGE" | "VIDEO" | "VOICE" | "TEXT",
): string {
  if (!intent || intent.preset === "auto") return "";
  const resolved = normalizeCreativeLocaleIntent(intent);
  const locale = CREATIVE_LOCALE_PRESETS.find((item) => item.id === intent.preset)!;
  const output = ["Target audience locale: " + locale.name + " (" + resolved.locale + ")."];
  if (kind === "TEXT" || kind === "VOICE" || kind === "VIDEO") {
    output.push("Use the selected language and appropriate spelling/linguistic register where speech or text is requested.");
  }
  if (kind === "VOICE" || kind === "VIDEO") {
    output.push("Only use regional pronunciation if the selected model/voice truly supports it; do not misrepresent accent support.");
  }
  if (intent.tone !== "natural") output.push("Requested tone: " + intent.tone + ".");
  if (intent.culturalContext !== "off" && (kind === "IMAGE" || kind === "VIDEO" || kind === "TEXT")) {
    output.push("Use culturally relevant details " + (intent.culturalContext === "on" ? "when appropriate" : "only where the request calls for them") + "; do not add stereotypes, landmarks, or costumes without a reason.");
  }
  output.push("Explicit user instructions and original references take precedence.");
  return output.join(" ");
}
