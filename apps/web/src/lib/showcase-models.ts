export const generationKinds = ["image", "video", "voice"] as const;

export type GenerationKind = (typeof generationKinds)[number];

export type ShowcaseModel = {
  id: string;
  kind: GenerationKind;
  name: string;
  provider: "BytePlus";
  description: string;
  badge: string;
  demoRate: string;
  demoCredits: string;
  latency: string;
};

export const showcaseModels: readonly ShowcaseModel[] = [
  {
    id: "seedream-5-lite",
    kind: "image",
    name: "Seedream 5.0 Lite",
    provider: "BytePlus",
    description:
      "Prompt-aware image creation with strong consistency and editing control.",
    badge: "Latest",
    demoRate: "28 credits / image",
    demoCredits: "28",
    latency: "~12 sec",
  },
  {
    id: "seedream-4-5",
    kind: "image",
    name: "Seedream 4.5",
    provider: "BytePlus",
    description:
      "Reliable 4K campaign visuals, typography, and multi-reference composition.",
    badge: "Studio",
    demoRate: "22 credits / image",
    demoCredits: "22",
    latency: "~9 sec",
  },
  {
    id: "seedance-2-5",
    kind: "video",
    name: "Seedance 2.5",
    provider: "BytePlus",
    description:
      "Cinematic multi-shot video generation with rich multimodal direction.",
    badge: "Premium",
    demoRate: "240 credits / 5 sec",
    demoCredits: "240",
    latency: "~3 min",
  },
  {
    id: "seedance-1-5-pro",
    kind: "video",
    name: "Seedance 1.5 Pro",
    provider: "BytePlus",
    description:
      "Fast, controllable clips with synchronized motion and audio generation.",
    badge: "Fast",
    demoRate: "170 credits / 5 sec",
    demoCredits: "170",
    latency: "~2 min",
  },
  {
    id: "seed-speech-2",
    kind: "voice",
    name: "Seed Speech TTS 2.0",
    provider: "BytePlus",
    description:
      "Expressive, context-aware narration with natural rhythm and pauses.",
    badge: "Expressive",
    demoRate: "6 credits / 1K chars",
    demoCredits: "6",
    latency: "~8 sec",
  },
  {
    id: "seed-speech-1",
    kind: "voice",
    name: "Seed Speech TTS 1.0",
    provider: "BytePlus",
    description:
      "Efficient multilingual voice generation for everyday production work.",
    badge: "Efficient",
    demoRate: "3 credits / 1K chars",
    demoCredits: "3",
    latency: "~5 sec",
  },
] as const;

export function getShowcaseModels(
  kind: GenerationKind,
): readonly ShowcaseModel[] {
  return showcaseModels.filter((model) => model.kind === kind);
}
