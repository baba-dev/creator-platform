import type { ProviderModelDescriptor } from "./index";
import { normalizeStudioTaskCapabilities } from "./studio-tasks";
import { VERIFIED_BYTEPLUS_MODELS as RAW_BYTEPLUS_MODELS } from "./byteplus";
import { VERIFIED_CLOUDFLARE_MODELS as RAW_CLOUDFLARE_MODELS } from "./cloudflare";
import { VERIFIED_GEMINI_MODELS as RAW_GEMINI_MODELS } from "./gemini";
import { VERIFIED_GROQ_MODELS as RAW_GROQ_MODELS } from "./groq";
import { NVIDIA_CHAT_MODELS } from "./nvidia/models";

function normalizeCatalog(
  models: readonly ProviderModelDescriptor[],
): readonly ProviderModelDescriptor[] {
  return models.map((model) => ({
    ...model,
    capabilities: normalizeStudioTaskCapabilities(model),
  }));
}

export const VERIFIED_BYTEPLUS_MODELS = normalizeCatalog(RAW_BYTEPLUS_MODELS);
export const VERIFIED_GROQ_MODELS = normalizeCatalog(RAW_GROQ_MODELS);
export const VERIFIED_GEMINI_MODELS = normalizeCatalog(RAW_GEMINI_MODELS);
export const VERIFIED_CLOUDFLARE_MODELS = normalizeCatalog(
  RAW_CLOUDFLARE_MODELS,
);

export const VERIFIED_NVIDIA_MODELS: readonly ProviderModelDescriptor[] =
  normalizeCatalog([
    {
      id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
      provider: "nvidia",
      displayName: "NVIDIA Nemotron 3 Nano Omni",
      description:
        "NVIDIA hosted reasoning model for development, evaluation, and licensed production deployments.",
      mediaKind: "reasoning",
      capabilities: {
        "task:prompt-enhancement": true,
        reasoning: true,
        instructMode: true,
      },
    },
    ...NVIDIA_CHAT_MODELS,
  ]);

export const VERIFIED_EXTERNAL_MODELS: readonly ProviderModelDescriptor[] = [
  ...VERIFIED_GROQ_MODELS,
  ...VERIFIED_GEMINI_MODELS,
  ...VERIFIED_CLOUDFLARE_MODELS,
  ...VERIFIED_NVIDIA_MODELS,
];

export const VERIFIED_ALL_MODELS: readonly ProviderModelDescriptor[] = [
  ...VERIFIED_BYTEPLUS_MODELS,
  ...VERIFIED_EXTERNAL_MODELS,
];
