import type { ProviderModelDescriptor } from "../index";

/**
 * Curated NVIDIA hosted chat-completions endpoints. These are text-only
 * integration contracts: even multimodal upstream models require a separate
 * validated image/video input contract before we expose vision capabilities.
 *
 * Catalog availability is NOT a license to resell NVIDIA's free trial API.
 * Newly synced models are disabled and have no published commercial price.
 */
export const NVIDIA_CHAT_MODELS: readonly ProviderModelDescriptor[] = [
  {
    id: "nvidia/nemotron-3.5-lightning-30b-a3b",
    provider: "nvidia",
    displayName: "Nemotron 3.5 Lightning (NVIDIA)",
    description:
      "Low-latency NVIDIA agentic text model for Pixel, creative drafting and conversation.",
    mediaKind: "text",
    capabilities: {
      contextWindow: 131072,
      maxTokens: 8192,
      chat: true,
      characterChat: true,
      scriptwriting: true,
      creativeDirector: true,
      storyPlanning: true,
      "task:prompt-enhancement": true,
      reasoning: true,
      fast: true,
    },
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b",
    provider: "nvidia",
    displayName: "Nemotron 3 Super (NVIDIA)",
    description: "NVIDIA long-context reasoning and agentic planning model.",
    mediaKind: "text",
    capabilities: {
      contextWindow: 131072,
      maxTokens: 8192,
      chat: true,
      characterChat: true,
      scriptwriting: true,
      creativeDirector: true,
      brandStrategy: true,
      storyPlanning: true,
      "task:prompt-enhancement": true,
      reasoning: true,
    },
  },
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b",
    provider: "nvidia",
    displayName: "Nemotron 3 Ultra (NVIDIA)",
    description:
      "Frontier-scale strategic reasoning and complex creative work.",
    mediaKind: "text",
    capabilities: {
      contextWindow: 131072,
      maxTokens: 8192,
      chat: true,
      creativeDirector: true,
      brandStrategy: true,
      storyPlanning: true,
      "task:prompt-enhancement": true,
      reasoning: true,
    },
  },
  {
    id: "z-ai/glm-5.3-flash",
    provider: "nvidia",
    displayName: "GLM 5.3 Flash (NVIDIA)",
    description:
      "Fast conversational and coding model served through NVIDIA NIM.",
    mediaKind: "text",
    capabilities: {
      contextWindow: 131072,
      maxTokens: 8192,
      chat: true,
      characterChat: true,
      scriptwriting: true,
      storyPlanning: true,
      "task:prompt-enhancement": true,
      reasoning: true,
      fast: true,
    },
  },
  {
    id: "z-ai/glm-5.3",
    provider: "nvidia",
    displayName: "GLM 5.3 (NVIDIA)",
    description:
      "Deep reasoning and multi-step creative planning through NVIDIA NIM.",
    mediaKind: "text",
    capabilities: {
      contextWindow: 131072,
      maxTokens: 8192,
      chat: true,
      scriptwriting: true,
      creativeDirector: true,
      brandStrategy: true,
      storyPlanning: true,
      reasoning: true,
    },
  },
  {
    id: "deepseek-ai/deepseek-v4.1-flash",
    provider: "nvidia",
    displayName: "DeepSeek V4.1 Flash (NVIDIA)",
    description:
      "Agentic and coding-focused text inference through NVIDIA NIM.",
    mediaKind: "text",
    capabilities: {
      contextWindow: 131072,
      maxTokens: 8192,
      chat: true,
      scriptwriting: true,
      creativeDirector: true,
      reasoning: true,
      fast: true,
    },
  },
  {
    id: "google/gemma-4-31b-it",
    provider: "nvidia",
    displayName: "Gemma 4 31B (NVIDIA)",
    description:
      "Instruction-tuned creative and conversational text model on NVIDIA NIM.",
    mediaKind: "text",
    capabilities: {
      contextWindow: 131072,
      maxTokens: 8192,
      chat: true,
      characterChat: true,
      scriptwriting: true,
      storyPlanning: true,
      reasoning: true,
    },
  },
  {
    id: "moonshotai/kimi-k3",
    provider: "nvidia",
    displayName: "Kimi K3 (NVIDIA)",
    description:
      "Long-horizon reasoning and agentic text generation through NVIDIA NIM.",
    mediaKind: "text",
    capabilities: {
      contextWindow: 131072,
      maxTokens: 8192,
      chat: true,
      creativeDirector: true,
      storyPlanning: true,
      reasoning: true,
    },
  },
  {
    id: "openai/gpt-oss-20b",
    provider: "nvidia",
    displayName: "GPT-OSS 20B (NVIDIA)",
    description: "Compact reasoning and conversational model hosted by NVIDIA.",
    mediaKind: "text",
    capabilities: {
      contextWindow: 131072,
      maxTokens: 8192,
      chat: true,
      characterChat: true,
      scriptwriting: true,
      "task:prompt-enhancement": true,
      reasoning: true,
      fast: true,
    },
  },
];

const CHAT_IDS = new Set(NVIDIA_CHAT_MODELS.map((model) => model.id));

export function isNvidiaChatModel(modelId: string): boolean {
  return CHAT_IDS.has(modelId);
}
