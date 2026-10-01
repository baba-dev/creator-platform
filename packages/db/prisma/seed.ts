import { type Prisma, PrismaClient } from "@prisma/client";
import { seedTemplateCatalog } from "./template-catalog";

const db = new PrismaClient();

interface SeedModel {
  providerModelId: string;
  mediaKind: "IMAGE" | "VIDEO" | "VOICE";
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
    providerModelId: "dreamina-seedance-2-0-mini-260615",
    mediaKind: "VIDEO",
    displayName: "Seedance 2.0 Mini",
    description:
      "Cost-efficient Seedance video generation for drafts, iteration, references, editing and extension.",
    capabilities: {
      "aspectRatio:16:9": true,
      "aspectRatio:9:16": true,
      "aspectRatio:1:1": true,
      "aspectRatio:4:3": true,
      "aspectRatio:3:4": true,
      "aspectRatio:21:9": true,
      "aspectRatio:adaptive": true,
      "resolution:480p": true,
      "resolution:720p": true,
      generateAudio: true,
      firstFrame: true,
      lastFrame: true,
      referenceImages: true,
      referenceVideo: true,
      referenceAudio: true,
      maxReferenceImages: 9,
      maxReferenceVideos: 3,
      maxReferenceAudio: 3,
      maxReferenceVideoDurationSeconds: 15,
      maxReferenceAudioDurationSeconds: 15,
      audioOnlyReference: false,
      editVideo: true,
      extendVideo: true,
      draftMode: false,
      outputFormatMov: false,
      returnLastFrame: true,
      minimumDurationSeconds: 4,
      maximumDurationSeconds: 15,
      fps: 24,
      concurrencyLimit: 10,
    },
    providerCostMicroUsd: 3_500n,
    customerCredits: 0n,
    pricingDimension: "TOKEN",
    unitQuantity: 1000,
    providerCostBasisNote:
      "BytePlus Seedance 2.0 Mini public PAYG list pricing. Promotions must be published as separate effective-dated price versions.",
    usageRates: {
      estimator: "byteplus-video-v2",
      rates: [
        {
          resolution: "480p",
          workflow: "GENERATE",
          microUsdPerThousandTokens: "3500",
        },
        {
          resolution: "720p",
          workflow: "GENERATE",
          microUsdPerThousandTokens: "3500",
        },
        {
          resolution: "480p",
          workflow: "VIDEO_INPUT",
          microUsdPerThousandTokens: "2100",
        },
        {
          resolution: "720p",
          workflow: "VIDEO_INPUT",
          microUsdPerThousandTokens: "2100",
        },
      ],
    },
  },
  {
    providerModelId: "dreamina-seedance-2-0-fast-260128",
    mediaKind: "VIDEO",
    displayName: "Seedance 2.0 Fast",
    description:
      "Fast Seedance iteration with multimodal references, synchronized audio, editing and extension.",
    capabilities: {
      "aspectRatio:16:9": true,
      "aspectRatio:9:16": true,
      "aspectRatio:1:1": true,
      "aspectRatio:4:3": true,
      "aspectRatio:3:4": true,
      "aspectRatio:21:9": true,
      "aspectRatio:adaptive": true,
      "resolution:480p": true,
      "resolution:720p": true,
      generateAudio: true,
      firstFrame: true,
      lastFrame: true,
      referenceImages: true,
      referenceVideo: true,
      referenceAudio: true,
      maxReferenceImages: 9,
      maxReferenceVideos: 3,
      maxReferenceAudio: 3,
      maxReferenceVideoDurationSeconds: 15,
      maxReferenceAudioDurationSeconds: 15,
      audioOnlyReference: false,
      editVideo: true,
      extendVideo: true,
      draftMode: false,
      outputFormatMov: false,
      returnLastFrame: true,
      minimumDurationSeconds: 4,
      maximumDurationSeconds: 15,
      fps: 24,
      concurrencyLimit: 10,
    },
    providerCostMicroUsd: 5_600n,
    customerCredits: 0n,
    pricingDimension: "TOKEN",
    unitQuantity: 1000,
    providerCostBasisNote:
      "BytePlus Seedance 2.0 Fast public PAYG list pricing. Promotions must be published as separate effective-dated price versions.",
    usageRates: {
      estimator: "byteplus-video-v2",
      rates: [
        {
          resolution: "480p",
          workflow: "GENERATE",
          microUsdPerThousandTokens: "5600",
        },
        {
          resolution: "720p",
          workflow: "GENERATE",
          microUsdPerThousandTokens: "5600",
        },
        {
          resolution: "480p",
          workflow: "VIDEO_INPUT",
          microUsdPerThousandTokens: "3300",
        },
        {
          resolution: "720p",
          workflow: "VIDEO_INPUT",
          microUsdPerThousandTokens: "3300",
        },
      ],
    },
  },
  {
    providerModelId: "dreamina-seedance-2-0-260128",
    mediaKind: "VIDEO",
    displayName: "Seedance 2.0",
    description:
      "Production Seedance video generation with 1080p/4K output, references, editing and extension.",
    capabilities: {
      "aspectRatio:16:9": true,
      "aspectRatio:9:16": true,
      "aspectRatio:1:1": true,
      "aspectRatio:4:3": true,
      "aspectRatio:3:4": true,
      "aspectRatio:21:9": true,
      "aspectRatio:adaptive": true,
      "resolution:480p": true,
      "resolution:720p": true,
      "resolution:1080p": true,
      "resolution:4K": true,
      generateAudio: true,
      firstFrame: true,
      lastFrame: true,
      referenceImages: true,
      referenceVideo: true,
      referenceAudio: true,
      maxReferenceImages: 9,
      maxReferenceVideos: 3,
      maxReferenceAudio: 3,
      maxReferenceVideoDurationSeconds: 15,
      maxReferenceAudioDurationSeconds: 15,
      audioOnlyReference: false,
      editVideo: true,
      extendVideo: true,
      draftMode: false,
      outputFormatMov: false,
      returnLastFrame: true,
      minimumDurationSeconds: 4,
      maximumDurationSeconds: 15,
      fps: 24,
      concurrencyLimit: 10,
      concurrencyLimit4K: 1,
    },
    providerCostMicroUsd: 7_000n,
    customerCredits: 0n,
    pricingDimension: "TOKEN",
    unitQuantity: 1000,
    providerCostBasisNote:
      "BytePlus Seedance 2.0 public PAYG list pricing by resolution and video-input workflow.",
    usageRates: {
      estimator: "byteplus-video-v2",
      rates: [
        {
          resolution: "480p",
          workflow: "GENERATE",
          microUsdPerThousandTokens: "7000",
        },
        {
          resolution: "720p",
          workflow: "GENERATE",
          microUsdPerThousandTokens: "7000",
        },
        {
          resolution: "1080p",
          workflow: "GENERATE",
          microUsdPerThousandTokens: "7700",
        },
        {
          resolution: "4K",
          workflow: "GENERATE",
          microUsdPerThousandTokens: "4000",
        },
        {
          resolution: "480p",
          workflow: "VIDEO_INPUT",
          microUsdPerThousandTokens: "4300",
        },
        {
          resolution: "720p",
          workflow: "VIDEO_INPUT",
          microUsdPerThousandTokens: "4300",
        },
        {
          resolution: "1080p",
          workflow: "VIDEO_INPUT",
          microUsdPerThousandTokens: "4700",
        },
        {
          resolution: "4K",
          workflow: "VIDEO_INPUT",
          microUsdPerThousandTokens: "2400",
        },
      ],
    },
  },
  {
    providerModelId: "dreamina-seedance-2-5-260628",
    mediaKind: "VIDEO",
    displayName: "Seedance 2.5",
    description:
      "Director-grade 30-second multimodal video generation, Draft review, editing and extension.",
    capabilities: {
      "aspectRatio:16:9": true,
      "aspectRatio:9:16": true,
      "aspectRatio:1:1": true,
      "aspectRatio:4:3": true,
      "aspectRatio:3:4": true,
      "aspectRatio:21:9": true,
      "aspectRatio:adaptive": true,
      "resolution:480p": true,
      "resolution:720p": true,
      "resolution:1080p": true,
      generateAudio: true,
      firstFrame: true,
      lastFrame: true,
      referenceImages: true,
      referenceVideo: true,
      referenceAudio: true,
      maxReferenceImages: 30,
      maxReferenceVideos: 10,
      maxReferenceAudio: 10,
      maxReferenceVideoDurationSeconds: 30,
      maxReferenceAudioDurationSeconds: 30,
      audioOnlyReference: true,
      editVideo: true,
      extendVideo: true,
      draftMode: true,
      outputFormatMov: true,
      returnLastFrame: true,
      minimumDurationSeconds: 4,
      maximumDurationSeconds: 30,
      fps: 24,
      concurrencyLimit: 10,
    },
    providerCostMicroUsd: 10_700n,
    customerCredits: 0n,
    pricingDimension: "TOKEN",
    unitQuantity: 1000,
    providerCostBasisNote:
      "BytePlus Seedance 2.5 public PAYG list pricing by resolution and video-input workflow.",
    usageRates: {
      estimator: "byteplus-video-v2",
      rates: [
        {
          resolution: "480p",
          workflow: "GENERATE",
          microUsdPerThousandTokens: "10700",
        },
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
          resolution: "480p",
          workflow: "VIDEO_INPUT",
          microUsdPerThousandTokens: "6400",
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
        enabled: true,
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
        enabled: true,
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
      enabled: true,
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
