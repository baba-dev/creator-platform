import { type Prisma, PrismaClient } from "@prisma/client";
import { seedTemplateCatalog } from "./template-catalog";

const db = new PrismaClient();

interface SeedModel {
  providerModelId: string;
  mediaKind: "IMAGE" | "VIDEO" | "VOICE" | "TEXT";
  displayName: string;
  description: string;
  capabilities: Prisma.InputJsonValue;
  providerCostMicroUsd: bigint;
  customerCredits: bigint;
  pricingDimension?: "REQUEST" | "CHARACTER" | "SECOND" | "TOKEN";
  usageRates?: Prisma.InputJsonValue;
  unitQuantity?: number;
  negotiatedDiscountBps?: number;
  providerCostBasisNote?: string;
  enabled?: boolean;
}

const verifiedBytePlusModels: readonly SeedModel[] = [
  {
    providerModelId: "seedream-5-0-260128",
    mediaKind: "IMAGE",
    displayName: "Seedream 5.0 Lite",
    description:
      "Prompt-aware image creation with strong consistency and editing control.",
    capabilities: {
      "aspectRatio:1:1": true,
      "aspectRatio:4:3": true,
      "aspectRatio:3:4": true,
      "aspectRatio:16:9": true,
      "aspectRatio:9:16": true,
      "aspectRatio:3:2": true,
      "aspectRatio:2:3": true,
      "aspectRatio:21:9": true,
      "resolution:2K": true,
      "resolution:3K": true,
      "resolution:4K": true,
      referenceImages: true,
      maxReferenceImages: 14,
      sequentialImages: true,
      maxGeneratedImages: 15,
      maxTotalInputOutputImages: 15,
    },
    providerCostMicroUsd: 31_500n,
    customerCredits: 18n,
    pricingDimension: "REQUEST",
    unitQuantity: 1,
  },
  {
    providerModelId: "dola-seedream-5-0-pro-260628",
    mediaKind: "IMAGE",
    displayName: "Seedream 5.0 Pro",
    description:
      "High-quality image generation and coordinate-guided precision editing.",
    capabilities: {
      "aspectRatio:1:1": true,
      "aspectRatio:4:3": true,
      "aspectRatio:3:4": true,
      "aspectRatio:16:9": true,
      "aspectRatio:9:16": true,
      "aspectRatio:3:2": true,
      "aspectRatio:2:3": true,
      "aspectRatio:21:9": true,
      "resolution:1K": true,
      "resolution:1.5K": true,
      "resolution:2K": true,
      referenceImages: true,
      maxReferenceImages: 10,
      sequentialImages: false,
      maxGeneratedImages: 1,
      maxTotalInputOutputImages: 11,
      preciseEditing: true,
      inpainting: true,
      outpainting: true,
      objectReplacement: true,
    },
    providerCostMicroUsd: 40_500n,
    customerCredits: 22n,
    pricingDimension: "REQUEST",
    unitQuantity: 1,
    negotiatedDiscountBps: 1_000,
    providerCostBasisNote:
      "Verified AIWA BytePlus Seedream 5.0 Pro rate: 10% discount, with base at <=1.5K output. 2K is 2x and additional input images after the first are 1/15th of base.",
  },
  {
    providerModelId: "seedream-4-5-251128",
    mediaKind: "IMAGE",
    displayName: "Seedream 4.5",
    description:
      "Reliable 4K campaign visuals, typography, and multi-reference composition.",
    capabilities: {
      "aspectRatio:1:1": true,
      "aspectRatio:4:3": true,
      "aspectRatio:3:4": true,
      "aspectRatio:16:9": true,
      "aspectRatio:9:16": true,
      "aspectRatio:3:2": true,
      "aspectRatio:2:3": true,
      "aspectRatio:21:9": true,
      "resolution:2K": true,
      "resolution:4K": true,
      referenceImages: true,
      maxReferenceImages: 14,
      sequentialImages: true,
      maxGeneratedImages: 15,
      maxTotalInputOutputImages: 15,
    },
    providerCostMicroUsd: 36_000n,
    customerCredits: 19n,
    pricingDimension: "REQUEST",
    unitQuantity: 1,
  },
  {
    providerModelId: "seedream-4-0-250828",
    mediaKind: "IMAGE",
    displayName: "Seedream 4.0",
    description:
      "Versatile foundation image generation with balanced styling and prompt fidelity.",
    capabilities: {
      "aspectRatio:1:1": true,
      "aspectRatio:4:3": true,
      "aspectRatio:3:4": true,
      "aspectRatio:16:9": true,
      "aspectRatio:9:16": true,
      "aspectRatio:3:2": true,
      "aspectRatio:2:3": true,
      "aspectRatio:21:9": true,
      "resolution:1K": true,
      "resolution:2K": true,
      "resolution:4K": true,
      referenceImages: true,
      maxReferenceImages: 14,
      sequentialImages: true,
      maxGeneratedImages: 15,
      maxTotalInputOutputImages: 15,
    },
    providerCostMicroUsd: 27_000n,
    customerCredits: 15n,
    pricingDimension: "REQUEST",
    unitQuantity: 1,
    negotiatedDiscountBps: 1_000,
    providerCostBasisNote:
      "Verified AIWA BytePlus Seedream 4.0 rate: 10% off the $0.030/image public list price.",
  },
  {
    providerModelId: "dreamina-seedance-2-5-260628",
    mediaKind: "VIDEO",
    displayName: "Seedance 2.5",
    description:
      "Cinematic multi-shot video generation with rich multimodal direction.",
    capabilities: {
      "aspectRatio:16:9": true,
      "aspectRatio:9:16": true,
      "aspectRatio:1:1": true,
      "aspectRatio:adaptive": true,
      "resolution:720p": true,
      "resolution:1080p": true,
      "durationSeconds:5": true,
      "durationSeconds:10": true,
      generateAudio: true,
      firstFrame: true,
      lastFrame: true,
      referenceVideo: true,
    },
    providerCostMicroUsd: 10_700n,
    customerCredits: 0n,
    pricingDimension: "TOKEN",
    unitQuantity: 1000,
    usageRates: {
      estimator: "byteplus-video-v1",
      rates: [
        {
          resolution: "720p",
          workflow: "GENERATE",
          microUsdPerThousandTokens: "10700",
        },
        {
          resolution: "1080p",
          workflow: "GENERATE",
          microUsdPerThousandTokens: "11700",
        },
        {
          resolution: "720p",
          workflow: "VIDEO_INPUT",
          microUsdPerThousandTokens: "6400",
        },
        {
          resolution: "1080p",
          workflow: "VIDEO_INPUT",
          microUsdPerThousandTokens: "7000",
        },
      ],
    },
  },
  {
    providerModelId: "seed-tts-2.0",
    mediaKind: "VOICE",
    displayName: "Seed Speech TTS 2.0",
    description:
      "Expressive, context-aware narration returned as synthesized audio bytes.",
    capabilities: {
      streaming: true,
      "format:mp3": true,
      "format:ogg_opus": true,
      "format:pcm": true,
      "sampleRate:24000": true,
      "speechRate:min": -50,
      "speechRate:max": 100,
    },
    providerCostMicroUsd: 30_000n,
    customerCredits: 16n,
    pricingDimension: "CHARACTER",
    unitQuantity: 1000,
  },
  {
    providerModelId: "dola-seed-2-1-turbo-260628",
    mediaKind: "TEXT",
    displayName: "Dola Seed 2.1 Turbo",
    description:
      "Flagship deep reasoning and agentic text generation with 256K context.",
    capabilities: {
      contextWindow: 262144,
      maxTokens: 8192,
      streaming: true,
      chat: true,
      reasoning: true,
      toolCall: true,
    },
    providerCostMicroUsd: 2_500n,
    customerCredits: 2n,
    pricingDimension: "TOKEN",
    unitQuantity: 1000,
    usageRates: {
      estimator: "byteplus-text-v1",
      tiers: [
        {
          maxPromptTokens: 262144,
          inputMicroUsdPerMillionTokens: "500000",
          outputMicroUsdPerMillionTokens: "2500000",
          cachedInputMicroUsdPerMillionTokens: "100000"
        }
      ]
    },
    providerCostBasisNote:
      "BytePlus ModelArk standard online inference: $0.50/M input, $0.10/M cached input, $2.50/M output.",
  },
  {
    providerModelId: "seed-2-0-pro-260328",
    mediaKind: "TEXT",
    displayName: "Seed 2.0 Pro",
    description:
      "Frontier reasoning, long-chain planning, and complex story architecture.",
    capabilities: {
      contextWindow: 262144,
      maxTokens: 8192,
      streaming: true,
      chat: true,
      reasoning: true,
      storyPlanning: true,
    },
    providerCostMicroUsd: 3_000n,
    customerCredits: 2n,
    pricingDimension: "TOKEN",
    unitQuantity: 1000,
    usageRates: {
      estimator: "byteplus-text-v1",
      tiers: [
        {
          maxPromptTokens: 131072,
          inputMicroUsdPerMillionTokens: "500000",
          outputMicroUsdPerMillionTokens: "3000000",
          cachedInputMicroUsdPerMillionTokens: "100000"
        },
        {
          maxPromptTokens: 262144,
          inputMicroUsdPerMillionTokens: "1000000",
          outputMicroUsdPerMillionTokens: "6000000",
          cachedInputMicroUsdPerMillionTokens: "200000"
        }
      ]
    },
    providerCostBasisNote:
      "BytePlus ModelArk standard online inference, tiered by prompt length (<=128K / <=256K).",
  },
  {
    providerModelId: "seed-2-0-lite-260428",
    mediaKind: "TEXT",
    displayName: "Seed 2.0 Lite",
    description:
      "High-efficiency balanced generation for scripts, articles, and dialogue.",
    capabilities: {
      contextWindow: 262144,
      maxTokens: 8192,
      streaming: true,
      chat: true,
      scriptwriting: true,
    },
    providerCostMicroUsd: 2_000n,
    customerCredits: 1n,
    pricingDimension: "TOKEN",
    unitQuantity: 1000,
    usageRates: {
      estimator: "byteplus-text-v1",
      tiers: [
        {
          maxPromptTokens: 131072,
          inputMicroUsdPerMillionTokens: "250000",
          outputMicroUsdPerMillionTokens: "2000000",
          cachedInputMicroUsdPerMillionTokens: "50000"
        },
        {
          maxPromptTokens: 262144,
          inputMicroUsdPerMillionTokens: "500000",
          outputMicroUsdPerMillionTokens: "4000000",
          cachedInputMicroUsdPerMillionTokens: "100000"
        }
      ]
    },
    providerCostBasisNote:
      "BytePlus ModelArk standard online inference, tiered by prompt length (<=128K / <=256K).",
  },
  {
    providerModelId: "seed-2-0-mini-260428",
    mediaKind: "TEXT",
    displayName: "Seed 2.0 Mini",
    description:
      "Low-latency responsive text generation for conversational assistance.",
    capabilities: {
      contextWindow: 262144,
      maxTokens: 4096,
      streaming: true,
      chat: true,
      fast: true,
    },
    providerCostMicroUsd: 400n,
    customerCredits: 1n,
    pricingDimension: "TOKEN",
    unitQuantity: 1000,
    usageRates: {
      estimator: "byteplus-text-v1",
      tiers: [
        {
          maxPromptTokens: 131072,
          inputMicroUsdPerMillionTokens: "100000",
          outputMicroUsdPerMillionTokens: "400000",
          cachedInputMicroUsdPerMillionTokens: "20000"
        },
        {
          maxPromptTokens: 262144,
          inputMicroUsdPerMillionTokens: "200000",
          outputMicroUsdPerMillionTokens: "800000",
          cachedInputMicroUsdPerMillionTokens: "40000"
        }
      ]
    },
    providerCostBasisNote:
      "BytePlus ModelArk standard online inference, tiered by prompt length (<=128K / <=256K).",
  },
  {
    providerModelId: "seed-2-0-code-preview-260328",
    mediaKind: "TEXT",
    displayName: "Seed 2.0 Code Preview",
    description:
      "Structured technical reasoning, prompt syntax, and code generation.",
    capabilities: {
      contextWindow: 262144,
      maxTokens: 8192,
      streaming: true,
      chat: true,
      code: true,
    },
    providerCostMicroUsd: 3_000n,
    customerCredits: 2n,
    pricingDimension: "TOKEN",
    unitQuantity: 1000,
    usageRates: {
      estimator: "byteplus-text-v1",
      tiers: [
        {
          maxPromptTokens: 131072,
          inputMicroUsdPerMillionTokens: "500000",
          outputMicroUsdPerMillionTokens: "3000000",
          cachedInputMicroUsdPerMillionTokens: "100000"
        },
        {
          maxPromptTokens: 262144,
          inputMicroUsdPerMillionTokens: "1000000",
          outputMicroUsdPerMillionTokens: "6000000",
          cachedInputMicroUsdPerMillionTokens: "200000"
        }
      ]
    },
    providerCostBasisNote:
      "BytePlus ModelArk standard online inference, tiered by prompt length (<=128K / <=256K).",
  },
  {
    providerModelId: "doubao-seed-character-260628",
    mediaKind: "TEXT",
    displayName: "Seed Character",
    description:
      "Persona-faithful conversational roleplay and expressive character dialogue.",
    capabilities: {
      contextWindow: 131072,
      maxTokens: 4096,
      streaming: true,
      chat: true,
      roleplay: true,
      characterChat: true,
    },
    providerCostMicroUsd: 1_500n,
    customerCredits: 1n,
    pricingDimension: "TOKEN",
    unitQuantity: 1000,
    providerCostBasisNote:
      "Provisional blended rate: $1.50/M total tokens; verify against the active BytePlus contract before changing margin.",
  },
  {
    providerModelId: "seed-1-8-251228",
    mediaKind: "TEXT",
    displayName: "Seed 1.8",
    description:
      "Reliable foundation model for steady long-form narrative generation.",
    capabilities: {
      contextWindow: 131072,
      maxTokens: 4096,
      streaming: true,
      chat: true,
    },
    providerCostMicroUsd: 2_000n,
    customerCredits: 1n,
    pricingDimension: "TOKEN",
    unitQuantity: 1000,
    usageRates: {
      estimator: "byteplus-text-v1",
      tiers: [
        {
          maxPromptTokens: 131072,
          inputMicroUsdPerMillionTokens: "250000",
          outputMicroUsdPerMillionTokens: "2000000",
          cachedInputMicroUsdPerMillionTokens: "50000"
        },
        {
          maxPromptTokens: 262144,
          inputMicroUsdPerMillionTokens: "500000",
          outputMicroUsdPerMillionTokens: "4000000",
          cachedInputMicroUsdPerMillionTokens: "50000"
        }
      ]
    },
    enabled: false,
    providerCostBasisNote:
      "Retired model. BytePlus standard online inference rates retained for historical pricing.",
  },
  {
    providerModelId: "seed-1-6-250915",
    mediaKind: "TEXT",
    displayName: "Seed 1.6",
    description:
      "Versatile foundation text model with consistent instruction following.",
    capabilities: {
      contextWindow: 131072,
      maxTokens: 4096,
      streaming: true,
      chat: true,
    },
    providerCostMicroUsd: 2_000n,
    customerCredits: 1n,
    pricingDimension: "TOKEN",
    unitQuantity: 1000,
    usageRates: {
      estimator: "byteplus-text-v1",
      tiers: [
        {
          maxPromptTokens: 131072,
          inputMicroUsdPerMillionTokens: "250000",
          outputMicroUsdPerMillionTokens: "2000000",
          cachedInputMicroUsdPerMillionTokens: "50000"
        },
        {
          maxPromptTokens: 262144,
          inputMicroUsdPerMillionTokens: "500000",
          outputMicroUsdPerMillionTokens: "4000000",
          cachedInputMicroUsdPerMillionTokens: "50000"
        }
      ]
    },
    enabled: false,
    providerCostBasisNote:
      "Retired model. BytePlus standard online inference rates retained for historical pricing.",
  },
  {
    providerModelId: "seed-1-6-flash-250715",
    mediaKind: "TEXT",
    displayName: "Seed 1.6 Flash",
    description:
      "Ultra-fast lightweight completion engine for real-time interaction.",
    capabilities: {
      contextWindow: 32768,
      maxTokens: 2048,
      streaming: true,
      chat: true,
      flash: true,
    },
    providerCostMicroUsd: 300n,
    customerCredits: 1n,
    pricingDimension: "TOKEN",
    unitQuantity: 1000,
    usageRates: {
      estimator: "byteplus-text-v1",
      tiers: [
        {
          maxPromptTokens: 131072,
          inputMicroUsdPerMillionTokens: "75000",
          outputMicroUsdPerMillionTokens: "300000",
          cachedInputMicroUsdPerMillionTokens: "15000"
        },
        {
          maxPromptTokens: 262144,
          inputMicroUsdPerMillionTokens: "100000",
          outputMicroUsdPerMillionTokens: "800000",
          cachedInputMicroUsdPerMillionTokens: "15000"
        }
      ]
    },
    enabled: false,
    providerCostBasisNote:
      "Retired model. BytePlus standard online inference rates retained for historical pricing.",
  },
];

async function main(): Promise<void> {
  const systemUser = await db.user.upsert({
    where: { email: "system@aiwamediagroup.com" },
    update: { platformRole: "PLATFORM_OWNER", emailVerified: true },
    create: {
      name: "Aiwa System",
      email: "system@aiwamediagroup.com",
      platformRole: "PLATFORM_OWNER",
      emailVerified: true,
    },
  });

  for (const model of verifiedBytePlusModels) {
    const providerModel = await db.providerModel.upsert({
      where: {
        provider_providerModelId: {
          provider: "BYTEPLUS",
          providerModelId: model.providerModelId,
        },
      },
      update: {
        displayName: model.displayName,
        description: model.description,
        mediaKind: model.mediaKind,
        capabilities: model.capabilities,
        ...(model.negotiatedDiscountBps === undefined
          ? {}
          : { negotiatedDiscountBps: model.negotiatedDiscountBps }),
      },
      create: {
        provider: "BYTEPLUS",
        providerModelId: model.providerModelId,
        displayName: model.displayName,
        description: model.description,
        mediaKind: model.mediaKind,
        capabilities: model.capabilities,
        enabled: model.enabled ?? true,
        ...(model.negotiatedDiscountBps === undefined
          ? {}
          : { negotiatedDiscountBps: model.negotiatedDiscountBps }),
      },
    });

    const activePrice = await db.modelPriceVersion.findFirst({
      where: {
        providerModelId: providerModel.id,
        effectiveTo: null,
      },
      orderBy: { effectiveFrom: "desc" },
    });

    if (!activePrice) {
      await db.modelPriceVersion.create({
        data: {
          providerModelId: providerModel.id,
          providerCostMicroUsd: model.providerCostMicroUsd,
          usageRates: model.usageRates,
          providerCostBasisNote: model.providerCostBasisNote,
          customerCredits: model.customerCredits,
          fxBaisaNumerator: 769n,
          fxBaisaDenominator: 2n,
          targetMarginBps: 2500,
          pricingDimension: model.pricingDimension ?? "REQUEST",
          unitQuantity: model.unitQuantity ?? 1,
          creditsPerBaisa: 1n,
          effectiveFrom: new Date("2026-01-01T00:00:00Z"),
          effectiveTo: null,
          createdById: systemUser.id,
        },
      });
      console.info(
        `Created price version for ${model.displayName}: ${model.customerCredits} credits`,
      );
    } else {
      console.info(
        `Active price version already exists for ${model.displayName} (${activePrice.customerCredits} credits)`,
      );
    }
  }

  const nvidiaReasoningModel =
    process.env.NVIDIA_REASONING_MODEL ||
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
  await db.providerModel.upsert({
    where: {
      provider_providerModelId: {
        provider: "NVIDIA",
        providerModelId: nvidiaReasoningModel,
      },
    },
    update: {
      mediaKind: "REASONING",
      displayName: "NVIDIA Nemotron 3 Nano Omni",
      description:
        "Creative reasoning for prompt enhancement and future copilot workflows.",
      capabilities: {
        "task:prompt-enhancement": true,
        instructMode: true,
      },
    },
    create: {
      provider: "NVIDIA",
      providerModelId: nvidiaReasoningModel,
      mediaKind: "REASONING",
      displayName: "NVIDIA Nemotron 3 Nano Omni",
      description:
        "Creative reasoning for prompt enhancement and future copilot workflows.",
      capabilities: {
        "task:prompt-enhancement": true,
        instructMode: true,
      },
      enabled: true,
    },
  });

  const createdTemplates = await seedTemplateCatalog(db);
  console.info(
    createdTemplates > 0
      ? `Created ${createdTemplates} missing generation templates.`
      : "Generation template catalog is already present.",
  );

  // Seed default presets for any existing organizations
  const activeOrgs = await db.organization.findMany({ select: { id: true } });
  const presetPersonas = [
    {
      name: "Creative Muse",
      tag: "Inspiration",
      description:
        "Poetic, perception-shifting ideation partner for bold creative concepts.",
      systemPrompt:
        "You are a poetic, inventive creative muse. You help creators push past cliché, unearth striking metaphors, and weave evocative narrative themes. You speak with warm artistic passion and precision.",
      modelId: "doubao-seed-character-260628",
    },
    {
      name: "Screenplay Polisher",
      tag: "Writing",
      description:
        "Dialogue doctor and script doctor specializing in scene rhythm and character voice.",
      systemPrompt:
        "You are a seasoned screenplay consultant. You analyze dialogue for subtext, authentic vernacular, dramatic tension, and economy of words. You provide actionable formatting and line revisions.",
      modelId: "doubao-seed-character-260628",
    },
    {
      name: "Brand Strategist",
      tag: "Marketing",
      description:
        "Senior commercial director focused on brand voice, positioning, and target audiences.",
      systemPrompt:
        "You are a master brand strategist and copy director. You ensure every line reflects authentic brand identity, cuts through market noise, and speaks directly to customer psychology.",
      modelId: "dola-seed-2-1-turbo-260628",
    },
    {
      name: "Historic Sage",
      tag: "Worldbuilding",
      description:
        "Scholar of era-authentic vernacular, historical context, and deep world lore.",
      systemPrompt:
        "You are a learned historian and cultural chronicler. You provide rich, period-accurate detail, historical idioms, sensory worldbuilding, and believable character motivations.",
      modelId: "doubao-seed-character-260628",
    },
  ];

  for (const org of activeOrgs) {
    for (const preset of presetPersonas) {
      const existing = await db.persona.findFirst({
        where: { organizationId: org.id, name: preset.name },
      });
      if (!existing) {
        await db.persona.create({
          data: {
            organizationId: org.id,
            name: preset.name,
            tag: preset.tag,
            description: preset.description,
            systemPrompt: preset.systemPrompt,
            modelId: preset.modelId,
            isPreset: true,
            createdById: systemUser.id,
          },
        });
      }
    }
  }

  console.info("Seeding completed successfully.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
