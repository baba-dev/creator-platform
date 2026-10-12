/** Serializable, customer-only contract shared by public server and client surfaces. */
export type PricingCategory = "chat" | "image" | "video" | "speech" | "audio" | "transcription" | "avatar" | "tools";
export const pricingCategories: readonly { id: PricingCategory; label: string; description: string }[] = [
  { id: "chat", label: "Chat & reasoning", description: "Writing, conversation, direction and reasoning." },
  { id: "image", label: "Image generation", description: "Create, reference and refine visuals." },
  { id: "video", label: "Video generation", description: "Motion, shots and cinematic sequences." },
  { id: "speech", label: "Speech & voice", description: "Text-to-speech and voice production." },
  { id: "audio", label: "Audio generation", description: "Prompted sound and advanced audio workflows." },
  { id: "transcription", label: "Transcription", description: "Turn speech and recordings into text." },
  { id: "avatar", label: "Avatars & presenters", description: "Spokespeople and character-driven motion." },
  { id: "tools", label: "Media tools", description: "Editing, enhancement and finishing operations." },
];
export interface PublicPriceTier {
  maxPromptTokens: number;
  inputCreditsPerMillion: string;
  outputCreditsPerMillion: string;
  cachedInputCreditsPerMillion: string | null;
}
export interface PublicPricingItem {
  id: string; kind: "model" | "tool"; name: string; provider: string; description: string;
  category: PricingCategory; availableIn: string[]; capabilities: string[]; dimension: string;
  unitQuantity: number; creditsPerBaisa: string; baseCredits: string; baseOmr: string; retailMicroUsdApprox: string;
  priceVersionId: string; effectiveFrom: string; tiers: PublicPriceTier[];
  exampleOnly: boolean; calculator: "text" | "unit" | "reference";
}
export interface PublicPricingCatalogue {
  generatedAt: string;
  models: PublicPricingItem[];
}
