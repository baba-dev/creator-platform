import { type Prisma, PrismaClient } from "@prisma/client";

const db = new PrismaClient();

interface SeedModel {
  providerModelId: string;
  mediaKind: "IMAGE" | "VIDEO" | "VOICE";
  displayName: string;
  description: string;
  capabilities: Prisma.InputJsonValue;
  providerCostMicroUsd: bigint;
  customerCredits: bigint;
}

const verifiedBytePlusModels: readonly SeedModel[] = [
  {
    providerModelId: "seedream-5-0-260128",
    mediaKind: "IMAGE",
    displayName: "Seedream 5.0 Lite",
    description:
      "Prompt-aware image creation with strong consistency and editing control.",
    capabilities: {
      aspectRatios: ["1:1", "16:9", "9:16", "4:3"],
      maxSteps: 50,
      defaultSteps: 30,
    },
    providerCostMicroUsd: 54_000n,
    customerCredits: 28n,
  },
  {
    providerModelId: "seedream-4-5-251128",
    mediaKind: "IMAGE",
    displayName: "Seedream 4.5",
    description:
      "Reliable 4K campaign visuals, typography, and multi-reference composition.",
    capabilities: {
      aspectRatios: ["1:1", "16:9", "9:16", "4:3"],
      resolution: "4k",
    },
    providerCostMicroUsd: 41_000n,
    customerCredits: 22n,
  },
  {
    providerModelId: "seedance-2-5",
    mediaKind: "VIDEO",
    displayName: "Seedance 2.5",
    description:
      "Cinematic multi-shot video generation with rich multimodal direction.",
    capabilities: {
      aspectRatios: ["16:9", "9:16", "1:1"],
      durationSeconds: [5, 10],
    },
    providerCostMicroUsd: 468_000n,
    customerCredits: 240n,
  },
  {
    providerModelId: "seed-speech-2",
    mediaKind: "VOICE",
    displayName: "Seed Speech TTS 2.0",
    description:
      "Expressive, context-aware narration with natural rhythm and pauses.",
    capabilities: {
      languages: ["en", "ar", "hi"],
    },
    providerCostMicroUsd: 10_000n,
    customerCredits: 6n,
  },
];

async function main(): Promise<void> {
  const systemUser = await db.user.upsert({
    where: { email: "system@aiwamediagroup.com" },
    update: { platformRole: "PLATFORM_OWNER" },
    create: {
      name: "Aiwa System",
      email: "system@aiwamediagroup.com",
      platformRole: "PLATFORM_OWNER",
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
      },
      create: {
        provider: "BYTEPLUS",
        providerModelId: model.providerModelId,
        displayName: model.displayName,
        description: model.description,
        mediaKind: model.mediaKind,
        capabilities: model.capabilities,
        enabled: true,
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
          customerCredits: model.customerCredits,
          fxBaisaNumerator: 769n,
          fxBaisaDenominator: 2n,
          targetMarginBps: 2500,
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
        structuredJson: true,
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
        structuredJson: true,
      },
      enabled: true,
    },
  });

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
