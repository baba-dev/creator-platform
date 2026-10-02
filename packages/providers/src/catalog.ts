import type { ProviderModelDescriptor } from "./index";
import { VERIFIED_BYTEPLUS_MODELS } from "./byteplus";
import { VERIFIED_CLOUDFLARE_MODELS } from "./cloudflare";
import { VERIFIED_GEMINI_MODELS } from "./gemini";
import { VERIFIED_GROQ_MODELS } from "./groq";

export {
  VERIFIED_BYTEPLUS_MODELS,
  VERIFIED_GROQ_MODELS,
  VERIFIED_GEMINI_MODELS,
  VERIFIED_CLOUDFLARE_MODELS,
};

export const VERIFIED_NVIDIA_MODELS: readonly ProviderModelDescriptor[] = [
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
];

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
