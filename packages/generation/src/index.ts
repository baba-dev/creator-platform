import { createHash } from "node:crypto";
import { hasOrganizationPermission } from "@aiwa/authz";
import { defaultAssetName, reserveAssetStorage } from "@aiwa/assets";
import {
  calculateBillableUnits,
  estimateGeneration,
  quoteImageGeneration,
  countBillableCharacters,
  createCreditQuote,
  reserveCreditsForJob,
} from "@aiwa/credits";
import { db, type Prisma } from "@aiwa/db";
import {
  assertAssignableProject,
  muscatCalendarMonth,
} from "@aiwa/organizations";
import { VERIFIED_BYTEPLUS_MODELS } from "@aiwa/providers/byteplus";
import { z } from "zod";
import { resolvePresetVoice, VoiceResolutionError } from "./voices";
import { inspectTalkingAvatarSources } from "./talking-avatar";
import {
  normalizeVideoRequest,
  validateVideoModelRequest,
  videoRequestSchema,
  type VideoRequestV2,
  type VideoSourceRole,
} from "./video-contract";

export * from "./voices";
export * from "./reconciliation";
export * from "./cancel";
export * from "./quote-contract";
export * from "./text";
export * from "./speech-trial";
export * from "./video-contract";
import { verifyGenerationQuote, quoteParameters } from "./quote-contract";

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_REFERENCE_SET_BYTES = 80 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export const imageRequestSchema = z
  .object({
    organizationId: z.string().min(1).max(100),
    projectId: z.string().min(1).max(100).nullable().optional(),
    modelId: z.string().min(1).max(100),
    priceVersionId: z.string().min(1).max(100),
    quoteToken: z.string().min(1).max(2048).optional(),
    idempotencyKey: z.uuid(),
    templateId: z.string().min(1).max(100).optional(),
    prompt: z.string().trim().min(1).max(2000),
    aspectRatio: z.enum([
      "1:1",
      "16:9",
      "9:16",
      "4:3",
      "3:4",
      "3:2",
      "2:3",
      "21:9",
    ]),
    resolution: z.enum(["1K", "1.5K", "2K", "3K", "4K"]).default("2K"),
    outputCount: z.number().int().min(1).max(15).default(1),
    referenceAssetIds: z
      .array(z.string().min(1).max(100))
      .max(14)
      .default([])
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Reference assets must be unique.",
      }),
  })
  .strict();

export const voiceRequestSchema = z
  .object({
    organizationId: z.string().min(1).max(100),
    projectId: z.string().min(1).max(100).nullable().optional(),
    modelId: z.string().min(1).max(100),
    priceVersionId: z.string().min(1).max(100),
    quoteToken: z.string().min(1).max(2048).optional(),
    idempotencyKey: z.uuid(),
    templateId: z.string().min(1).max(100).optional(),
    text: z.string().trim().min(1).max(4096),
    voiceKey: z.string().trim().min(1).max(100),
    speechRate: z.number().min(0.5).max(2.0).default(1.0),
    format: z.literal("mp3").default("mp3"),
  })
  .strict();

export const imageModelIds = VERIFIED_BYTEPLUS_MODELS.filter(
  (m) => m.mediaKind === "image",
).map((m) => m.id);

export const videoModelIds = VERIFIED_BYTEPLUS_MODELS.filter(
  (m) => m.mediaKind === "video",
).map((m) => m.id);

export const voiceModelIds = VERIFIED_BYTEPLUS_MODELS.filter(
  (m) => m.mediaKind === "voice",
).map((m) => m.id);

export const textRequestSchema = z
  .object({
    organizationId: z.string().min(1).max(100),
    projectId: z.string().min(1).max(100).nullable().optional(),
    modelId: z.string().min(1).max(100),
    priceVersionId: z.string().min(1).max(100),
    quoteToken: z.string().min(1).max(2048).optional(),
    idempotencyKey: z.uuid(),
    templateId: z.string().min(1).max(100).optional(),
    messages: z
      .array(
        z.object({
          role: z.enum(["system", "user", "assistant"]),
          content: z.string().min(1).max(8000),
        }),
      )
      .min(1)
      .max(50),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().int().positive().max(8192).default(2048),
  })
  .strict()
  .superRefine((value, context) => {
    const totalCharacters = value.messages.reduce(
      (sum, message) => sum + message.content.length,
      0,
    );
    if (totalCharacters > 120_000) {
      context.addIssue({
        code: "custom",
        path: ["messages"],
        message:
          "Combined text-generation context cannot exceed 120,000 characters.",
      });
    }
  });

export const textModelIds = VERIFIED_BYTEPLUS_MODELS.filter(
  (m) => m.mediaKind === "text",
).map((m) => m.id);

export function hasModelCapability(
  capabilities: unknown,
  capability: string,
): boolean {
  if (
    !capabilities ||
    typeof capabilities !== "object" ||
    Array.isArray(capabilities)
  )
    return false;
  return (capabilities as Record<string, unknown>)[capability] === true;
}

export async function resolveGenerationTemplateId(
  tx: Prisma.TransactionClient,
  templateId: string | undefined,
  mediaKind: "IMAGE" | "VIDEO" | "VOICE" | "TEXT",
): Promise<string | null> {
  if (!templateId) return null;
  const template = await tx.generationTemplate.findFirst({
    where: { id: templateId, mediaKind, status: "PUBLISHED" },
    select: { id: true },
  });
  if (!template) {
    throw new GenerationError(
      "Template is unavailable or no longer published.",
      409,
    );
  }
  return template.id;
}

export class GenerationError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function priceCredits(price: {
  providerCostMicroUsd: bigint;
  fxBaisaNumerator: bigint;
  fxBaisaDenominator: bigint;
  targetMarginBps: number;
  creditsPerBaisa: bigint;
}) {
  return createCreditQuote({
    providerCostMicroUsd: price.providerCostMicroUsd,
    exchangeRate: {
      baisaNumerator: price.fxBaisaNumerator,
      baisaDenominator: price.fxBaisaDenominator,
    },
    targetGrossMarginBps: price.targetMarginBps,
    creditsPerBaisa: price.creditsPerBaisa,
  }).customerCredits;
}
export async function requireMembership(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  generate = false,
) {
  const member = await tx.membership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: { organization: true, user: true },
  });
  if (
    !member ||
    member.user.disabledAt ||
    member.user.emailVerified !== true ||
    member.organization.status !== "ACTIVE" ||
    !hasOrganizationPermission(
      member.role,
      generate ? "generation:create" : "workspace:view",
    )
  )
    throw new GenerationError("Workspace access denied.", 403);
  return member;
}

export async function assertWithinMonthlySpendingCap(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string;
    userId: string;
    cap: bigint | null;
    additionalCredits: bigint;
    now?: Date;
  },
): Promise<void> {
  if (params.cap === null) return;

  const { start, end } = muscatCalendarMonth(params.now ?? new Date());
  const [succeededAgg, inFlightAgg] = await Promise.all([
    tx.generationJob.aggregate({
      where: {
        organizationId: params.organizationId,
        createdById: params.userId,
        createdAt: { gte: start, lt: end },
        status: "SUCCEEDED",
      },
      _sum: { chargedCredits: true },
    }),
    tx.generationJob.aggregate({
      where: {
        organizationId: params.organizationId,
        createdById: params.userId,
        createdAt: { gte: start, lt: end },
        status: { notIn: ["CANCELLED", "FAILED", "DRAFT", "SUCCEEDED"] },
      },
      _sum: { reservedCredits: true },
    }),
  ]);

  const spent =
    (succeededAgg._sum.chargedCredits ?? 0n) +
    (inFlightAgg._sum.reservedCredits ?? 0n);

  if (spent + params.additionalCredits > params.cap) {
    throw new GenerationError("Monthly spending cap exceeded.");
  }
}

export async function createImageJob(userId: string, raw: unknown) {
  const input = imageRequestSchema.parse(raw);
  const payload = {
    prompt: input.prompt,
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    outputFormat: "png",
    watermark: false,
    outputCount: input.outputCount,
    referenceAssetIds: input.referenceAssetIds,
  };
  const key = createHash("sha256")
    .update(`${input.organizationId}:${userId}:${input.idempotencyKey}`)
    .digest("hex");
  return db.$transaction(
    async (tx) => {
      // Serialize budget, quota and duplicate-request checks with organization mutations.
      await tx.$queryRaw`SELECT id FROM Organization WHERE id = ${input.organizationId} FOR UPDATE`;
      const member = await requireMembership(
        tx,
        input.organizationId,
        userId,
        true,
      );
      const templateId = await resolveGenerationTemplateId(
        tx,
        input.templateId,
        "IMAGE",
      );
      const existing = await tx.generationJob.findUnique({
        where: { idempotencyKey: key },
      });
      if (existing) {
        if (
          existing.projectId !== (input.projectId ?? null) ||
          existing.templateId !== templateId ||
          existing.providerModelId !== input.modelId ||
          existing.priceVersionId !== input.priceVersionId ||
          JSON.stringify(
            (() => {
              const existingPayload =
                existing.requestPayload &&
                typeof existing.requestPayload === "object" &&
                !Array.isArray(existing.requestPayload)
                  ? { ...(existing.requestPayload as Record<string, unknown>) }
                  : {};
              delete existingPayload.draftProviderTaskId;
              delete existingPayload.draftBillingContext;
              delete existingPayload.trustedDrivingAudioDurationMs;
              delete existingPayload.billableDurationSeconds;
              return existingPayload;
            })(),
          ) !== JSON.stringify(payload)
        ) {
          // JSON columns can reorder keys: compare canonical fields below.
          const old = existing.requestPayload as Partial<typeof payload>;
          const sameReferences =
            Array.isArray(old.referenceAssetIds) &&
            old.referenceAssetIds.length === payload.referenceAssetIds.length &&
            old.referenceAssetIds.every(
              (assetId, index) => assetId === payload.referenceAssetIds[index],
            );
          if (
            existing.projectId !== (input.projectId ?? null) ||
            existing.templateId !== templateId ||
            existing.providerModelId !== input.modelId ||
            existing.priceVersionId !== input.priceVersionId ||
            old.prompt !== payload.prompt ||
            old.aspectRatio !== payload.aspectRatio ||
            old.resolution !== payload.resolution ||
            old.outputFormat !== payload.outputFormat ||
            old.watermark !== payload.watermark ||
            old.outputCount !== payload.outputCount ||
            !sameReferences
          )
            throw new GenerationError(
              "Request key was already used for different inputs.",
              409,
            );
        }
        return existing;
      }
      await assertAssignableProject(tx, input.organizationId, input.projectId);
      const now = new Date();
      const model = await tx.providerModel.findFirst({
        where: {
          id: input.modelId,
          enabled: true,
          provider: "BYTEPLUS",
          mediaKind: "IMAGE",
          providerModelId: { in: imageModelIds },
        },
        include: {
          priceVersions: {
            where: {
              effectiveFrom: { lte: now },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
            },
            orderBy: { effectiveFrom: "desc" },
            take: 1,
          },
        },
      });
      const price = model?.priceVersions[0];
      if (!model || !price || price.id !== input.priceVersionId)
        throw new GenerationError(
          "Model or price changed. Refresh the Studio and try again.",
          409,
        );

      if (
        !hasModelCapability(
          model.capabilities,
          `aspectRatio:${input.aspectRatio}`,
        )
      ) {
        throw new GenerationError(
          "Aspect ratio is not supported by this model.",
        );
      }
      if (
        !hasModelCapability(
          model.capabilities,
          `resolution:${input.resolution}`,
        )
      ) {
        throw new GenerationError("Resolution is not supported by this model.");
      }

      if (
        input.referenceAssetIds.length > 0 &&
        !hasModelCapability(model.capabilities, "referenceImages")
      ) {
        throw new GenerationError(
          "Reference images are not supported by this model.",
        );
      }
      const maxReferencesRaw =
        model.capabilities &&
        typeof model.capabilities === "object" &&
        !Array.isArray(model.capabilities)
          ? (model.capabilities as Record<string, unknown>).maxReferenceImages
          : undefined;
      const maxReferences =
        typeof maxReferencesRaw === "number" ? maxReferencesRaw : 0;
      if (input.referenceAssetIds.length > maxReferences) {
        throw new GenerationError(
          `This model supports at most ${maxReferences} reference images.`,
        );
      }
      const capabilityRecord =
        model.capabilities &&
        typeof model.capabilities === "object" &&
        !Array.isArray(model.capabilities)
          ? (model.capabilities as Record<string, unknown>)
          : {};
      const maxGeneratedImages =
        typeof capabilityRecord.maxGeneratedImages === "number"
          ? capabilityRecord.maxGeneratedImages
          : 1;
      const maxTotalImages =
        typeof capabilityRecord.maxTotalInputOutputImages === "number"
          ? capabilityRecord.maxTotalInputOutputImages
          : maxGeneratedImages;
      if (input.outputCount > 1 && capabilityRecord.sequentialImages !== true) {
        throw new GenerationError(
          "Multiple related images are not supported by this model.",
        );
      }
      if (input.outputCount > maxGeneratedImages) {
        throw new GenerationError(
          `This model supports at most ${maxGeneratedImages} generated images per request.`,
        );
      }
      if (input.referenceAssetIds.length + input.outputCount > maxTotalImages) {
        throw new GenerationError(
          `Reference images plus generated images must not exceed ${maxTotalImages}.`,
        );
      }

      const referenceAssets = input.referenceAssetIds.length
        ? await tx.asset.findMany({
            where: {
              id: { in: input.referenceAssetIds },
              organizationId: input.organizationId,
              mediaKind: "IMAGE",
              status: "READY",
              storageProvider: "LOCAL",
              OR: [
                { purpose: "GENERAL" },
                {
                  purpose: "REFERENCE_INPUT",
                  storageOwnerUserId: userId,
                },
              ],
            },
            select: {
              id: true,
              byteSize: true,
            },
          })
        : [];
      if (referenceAssets.length !== input.referenceAssetIds.length) {
        throw new GenerationError(
          "One or more reference images are unavailable.",
          404,
        );
      }
      const referenceBytes = referenceAssets.reduce(
        (total, asset) => total + asset.byteSize,
        0n,
      );
      if (referenceBytes > BigInt(MAX_REFERENCE_SET_BYTES)) {
        throw new GenerationError(
          "Reference image set exceeds the 80 MB safety limit.",
          413,
        );
      }

      const credits = quoteImageGeneration(price, {
        providerModelId: model.providerModelId,
        resolution: input.resolution,
        outputCount: input.outputCount,
        referenceImageCount: input.referenceAssetIds.length,
      }).customerCredits;
      try {
        verifyGenerationQuote(
          input.quoteToken,
          {
            organizationId: input.organizationId,
            userId,
            modelId: model.id,
            priceVersionId: price.id,
            parameters: quoteParameters(model.mediaKind, input),
          },
          credits,
          now,
        );
      } catch (error) {
        throw new GenerationError(
          error instanceof Error ? error.message : "Quote is invalid.",
          409,
        );
      }
      await assertWithinMonthlySpendingCap(tx, {
        organizationId: input.organizationId,
        userId,
        cap: member.monthlySpendingCapCredits,
        additionalCredits: credits,
        now,
      });
      await reserveAssetStorage(tx, {
        organizationId: input.organizationId,
        userId,
        proposedBytes: BigInt(MAX_IMAGE_BYTES) * BigInt(input.outputCount),
      });
      const wallet = await tx.wallet.findUnique({
        where: { organizationId: input.organizationId },
      });
      if (!wallet)
        throw new GenerationError("Workspace wallet is unavailable.");
      const job = await tx.generationJob.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId ?? null,
          templateId,
          createdById: userId,
          providerModelId: model.id,
          priceVersionId: price.id,
          idempotencyKey: key,
          requestPayload: payload,
          status: "QUOTED",
          quotedUnits: input.outputCount,
          billableQuantity: input.outputCount,
          quotedAt: now,
        },
      });
      if (input.referenceAssetIds.length) {
        const positions = new Map(
          input.referenceAssetIds.map((assetId, position) => [
            assetId,
            position,
          ]),
        );
        await tx.generationInputAsset.createMany({
          data: referenceAssets.map((asset) => ({
            generationJobId: job.id,
            assetId: asset.id,
            position: positions.get(asset.id)!,
          })),
        });
      }
      await reserveCreditsForJob(tx, {
        walletId: wallet.id,
        amountCredits: credits,
        idempotencyKey: `generation-reserve-${job.id}`,
        jobId: job.id,
      });
      const isJpegDefault =
        model.providerModelId === "seedream-4-5-251128" ||
        model.providerModelId === "seedream-4-0-250828";
      const extension = isJpegDefault ? "jpg" : "png";
      const mimeType = isJpegDefault ? "image/jpeg" : "image/png";
      await tx.asset.createMany({
        data: Array.from({ length: input.outputCount }, (_, outputIndex) => ({
          organizationId: input.organizationId,
          projectId: input.projectId ?? null,
          storageOwnerUserId: userId,
          createdById: userId,
          generationJobId: job.id,
          generationOutputIndex: outputIndex,
          mediaKind: "IMAGE" as const,
          sourceType: "GENERATED" as const,
          storageProvider: "LOCAL" as const,
          name:
            input.outputCount === 1
              ? defaultAssetName("IMAGE", "GENERATED")
              : `${defaultAssetName("IMAGE", "GENERATED")} ${outputIndex + 1}`,
          objectKey:
            input.outputCount === 1
              ? `${job.id}.${extension}`
              : `${job.id}-${outputIndex + 1}.${extension}`,
          mimeType,
          byteSize: BigInt(MAX_IMAGE_BYTES),
          status: "PENDING" as const,
        })),
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: userId,
          organizationId: input.organizationId,
          action: "generation.queued",
          targetType: "GenerationJob",
          targetId: job.id,
        },
      });
      // QUEUED is the durable outbox; the worker republishes it after Redis outages.
      return tx.generationJob.update({
        where: { id: job.id },
        data: { status: "QUEUED", queuedAt: now },
      });
    },
    { isolationLevel: "ReadCommitted", timeout: 15000 },
  );
}

export async function createVideoJob(userId: string, raw: unknown) {
  const parsed = videoRequestSchema.parse(raw);
  const input = normalizeVideoRequest(parsed);
  const isV2 = "schemaVersion" in parsed && parsed.schemaVersion === 2;
  const payload: Record<string, unknown> = isV2
    ? {
        schemaVersion: 2,
        workflow: input.workflow,
        prompt: input.prompt,
        sources: input.sources,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
        durationSeconds: input.durationSeconds,
        generateAudio: input.generateAudio,
        outputFormat: input.outputFormat,
        returnLastFrame: input.returnLastFrame,
        watermark: false,
        ...(input.seed === undefined ? {} : { seed: input.seed }),
        ...(input.sourceDraftJobId
          ? { sourceDraftJobId: input.sourceDraftJobId }
          : {}),
        ...(input.extensionDirection
          ? { extensionDirection: input.extensionDirection }
          : {}),
      }
    : {
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
        durationSeconds: input.durationSeconds,
        generateAudio: input.generateAudio,
        watermark: false,
        ...(input.sources.find((source) => source.role === "FIRST_FRAME")
          ? {
              firstFrameAssetId: input.sources.find(
                (source) => source.role === "FIRST_FRAME",
              )!.assetId,
            }
          : {}),
        ...(input.sources.find((source) => source.role === "LAST_FRAME")
          ? {
              lastFrameAssetId: input.sources.find(
                (source) => source.role === "LAST_FRAME",
              )!.assetId,
            }
          : {}),
        ...(input.sources.find((source) => source.role === "REFERENCE_VIDEO")
          ? {
              referenceVideoAssetId: input.sources.find(
                (source) => source.role === "REFERENCE_VIDEO",
              )!.assetId,
            }
          : {}),
      };

  const key = createHash("sha256")
    .update(`${input.organizationId}:${userId}:${input.idempotencyKey}`)
    .digest("hex");

  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM Organization WHERE id = ${input.organizationId} FOR UPDATE`;
      const member = await requireMembership(
        tx,
        input.organizationId,
        userId,
        true,
      );
      const templateId = await resolveGenerationTemplateId(
        tx,
        input.templateId,
        "VIDEO",
      );
      const existing = await tx.generationJob.findUnique({
        where: { idempotencyKey: key },
      });
      if (existing) {
        if (
          existing.projectId !== (input.projectId ?? null) ||
          existing.templateId !== templateId ||
          existing.providerModelId !== input.modelId ||
          existing.priceVersionId !== input.priceVersionId ||
          JSON.stringify(
            (() => {
              const existingPayload =
                existing.requestPayload &&
                typeof existing.requestPayload === "object" &&
                !Array.isArray(existing.requestPayload)
                  ? { ...(existing.requestPayload as Record<string, unknown>) }
                  : {};
              delete existingPayload.draftProviderTaskId;
              delete existingPayload.draftBillingContext;
              delete existingPayload.trustedDrivingAudioDurationMs;
              delete existingPayload.billableDurationSeconds;
              return existingPayload;
            })(),
          ) !== JSON.stringify(payload)
        ) {
          throw new GenerationError(
            "Request key was already used for different inputs.",
            409,
          );
        }
        return existing;
      }

      await assertAssignableProject(tx, input.organizationId, input.projectId);
      const now = new Date();
      const model = await tx.providerModel.findFirst({
        where: {
          id: input.modelId,
          enabled: true,
          provider: "BYTEPLUS",
          mediaKind: "VIDEO",
          providerModelId: { in: videoModelIds },
        },
        include: {
          priceVersions: {
            where: {
              effectiveFrom: { lte: now },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
            },
            orderBy: { effectiveFrom: "desc" },
            take: 1,
          },
        },
      });
      const price = model?.priceVersions[0];
      if (!model || !price || price.id !== input.priceVersionId) {
        throw new GenerationError(
          "Model or price changed. Refresh the Studio and try again.",
          409,
        );
      }

      const capabilityError = validateVideoModelRequest(
        model.providerModelId,
        model.capabilities,
        input,
      );
      if (capabilityError) throw new GenerationError(capabilityError);

      const sourceIds = input.sources.map((source) => source.assetId);
      const assets = sourceIds.length
        ? await tx.asset.findMany({
            where: {
              id: { in: sourceIds },
              organizationId: input.organizationId,
              status: "READY",
              storageProvider: "LOCAL",
            },
          })
        : [];
      const assetById = new Map(assets.map((asset) => [asset.id, asset]));
      if (
        assets.length !== sourceIds.length ||
        assets.some(
          (asset) =>
            asset.purpose === "REFERENCE_INPUT" &&
            asset.storageOwnerUserId !== userId,
        )
      ) {
        throw new GenerationError("Source media is unavailable.", 404);
      }

      const capabilities =
        model.capabilities &&
        typeof model.capabilities === "object" &&
        !Array.isArray(model.capabilities)
          ? (model.capabilities as Record<string, unknown>)
          : {};
      const maxVideoInputSeconds =
        typeof capabilities.maxReferenceVideoDurationSeconds === "number"
          ? capabilities.maxReferenceVideoDurationSeconds
          : model.providerModelId.startsWith("dreamina-seedance-2-5-")
            ? 30
            : 15;
      const maxAudioInputSeconds =
        typeof capabilities.maxReferenceAudioDurationSeconds === "number"
          ? capabilities.maxReferenceAudioDurationSeconds
          : maxVideoInputSeconds;
      let totalInputVideoDurationMs = 0;
      let totalInputAudioDurationMs = 0;

      for (const source of input.sources) {
        const asset = assetById.get(source.assetId);
        if (!asset)
          throw new GenerationError("Source media is unavailable.", 404);
        const expectsImage =
          source.role === "FIRST_FRAME" ||
          source.role === "LAST_FRAME" ||
          source.role === "REFERENCE_IMAGE" ||
          source.role === "AVATAR_IMAGE";
        const expectsVideo =
          source.role === "REFERENCE_VIDEO" || source.role === "SOURCE_VIDEO";
        const expectsAudio =
          source.role === "REFERENCE_AUDIO" || source.role === "DRIVING_AUDIO";

        if (
          (expectsImage && asset.mediaKind !== "IMAGE") ||
          (expectsVideo && asset.mediaKind !== "VIDEO") ||
          (expectsAudio && asset.mediaKind !== "AUDIO")
        ) {
          throw new GenerationError(
            `Source role ${source.role} does not match the asset type.`,
          );
        }

        if (expectsImage && source.role !== "AVATAR_IMAGE") {
          if (
            asset.byteSize > 20n * 1024n * 1024n ||
            !asset.mimeType.startsWith("image/")
          )
            throw new GenerationError(
              "Reference image is outside provider limits.",
            );
        }

        if (expectsVideo) {
          if (
            asset.durationMs === null ||
            asset.durationMs < 2_000 ||
            asset.durationMs > maxVideoInputSeconds * 1000 ||
            asset.width === null ||
            asset.height === null ||
            asset.width < 300 ||
            asset.height < 300 ||
            asset.width * asset.height < 407_696 ||
            asset.width * asset.height > 8_295_044 ||
            asset.width / asset.height < 0.4 ||
            asset.width / asset.height > 2.5 ||
            asset.byteSize > 100_000_000n ||
            !["video/mp4", "video/quicktime"].includes(asset.mimeType)
          )
            throw new GenerationError(
              "Reference video is outside provider limits.",
            );
          if (
            source.role === "SOURCE_VIDEO" &&
            input.workflow === "EDIT" &&
            asset.durationMs < 4_000
          )
            throw new GenerationError(
              "Video editing requires a source between 4 seconds and the model limit.",
            );
          totalInputVideoDurationMs += asset.durationMs;
        }

        if (expectsAudio && source.role !== "DRIVING_AUDIO") {
          if (
            asset.durationMs === null ||
            asset.durationMs < 2_000 ||
            asset.durationMs > maxAudioInputSeconds * 1000 ||
            asset.byteSize > 15n * 1024n * 1024n ||
            !["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"].includes(
              asset.mimeType,
            )
          )
            throw new GenerationError(
              "Reference audio is outside provider limits.",
            );
          totalInputAudioDurationMs += asset.durationMs;
        }
      }

      if (totalInputVideoDurationMs > maxVideoInputSeconds * 1000)
        throw new GenerationError(
          "Combined reference video duration exceeds the model limit.",
        );
      if (totalInputAudioDurationMs > maxAudioInputSeconds * 1000)
        throw new GenerationError(
          "Combined reference audio duration exceeds the model limit.",
        );

      let pricingDurationSeconds =
        input.durationSeconds === -1 ? 5 : input.durationSeconds;
      let pricingAspectRatio = input.aspectRatio;
      let pricingGenerateAudio = input.generateAudio;
      let pricingInputVideoDurationMs =
        totalInputVideoDurationMs > 0 ? totalInputVideoDurationMs : undefined;
      let draftProviderTaskId: string | undefined;

      if (input.workflow === "TALKING_AVATAR") {
        try {
          const facts = inspectTalkingAvatarSources(input, assetById);
          pricingDurationSeconds = facts.billableDurationSeconds;
          pricingAspectRatio = "adaptive";
          pricingGenerateAudio = false;
          payload.trustedDrivingAudioDurationMs =
            facts.drivingAudioDurationMs;
          payload.billableDurationSeconds = facts.billableDurationSeconds;
        } catch (error) {
          throw new GenerationError(
            error instanceof Error
              ? error.message
              : "Talking-avatar source media is invalid.",
          );
        }
      }

      if (input.workflow === "EDIT") {
        const source = input.sources.find(
          (item) => item.role === "SOURCE_VIDEO",
        );
        const asset = source ? assetById.get(source.assetId) : undefined;
        pricingDurationSeconds = Math.max(
          4,
          Math.min(30, Math.ceil((asset?.durationMs ?? 5_000) / 1000)),
        );
      }

      if (input.workflow === "DRAFT_FINAL") {
        const draft = await tx.generationJob.findFirst({
          where: {
            id: input.sourceDraftJobId!,
            organizationId: input.organizationId,
            createdById: userId,
            status: "SUCCEEDED",
            providerModelId: model.id,
          },
          include: {
            inputAssets: { include: { asset: true } },
          },
        });
        if (
          !draft?.providerRequestId ||
          now.getTime() - draft.createdAt.getTime() >= 7 * 24 * 60 * 60 * 1000
        )
          throw new GenerationError(
            "The source Draft is unavailable or has expired.",
            409,
          );
        const draftPayload = draft.requestPayload as Record<string, unknown>;
        if (
          draftPayload.schemaVersion !== 2 ||
          draftPayload.workflow !== "DRAFT"
        )
          throw new GenerationError(
            "The selected job is not a Seedance 2.5 Draft.",
            409,
          );
        draftProviderTaskId = draft.providerRequestId;
        pricingDurationSeconds =
          typeof draftPayload.durationSeconds === "number"
            ? draftPayload.durationSeconds
            : 5;
        const draftAspectRatio = draftPayload.aspectRatio;
        pricingAspectRatio =
          typeof draftAspectRatio === "string" &&
          ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"].includes(
            draftAspectRatio,
          )
            ? (draftAspectRatio as VideoRequestV2["aspectRatio"])
            : "16:9";
        pricingGenerateAudio = draftPayload.generateAudio === true;
        const originalVideoMs = draft.inputAssets.reduce(
          (sum, item) =>
            item.asset.mediaKind === "VIDEO"
              ? sum + (item.asset.durationMs ?? 0)
              : sum,
          0,
        );
        pricingInputVideoDurationMs =
          originalVideoMs > 0 ? originalVideoMs : undefined;
        payload.draftProviderTaskId = draftProviderTaskId;
        payload.draftBillingContext = {
          durationSeconds: pricingDurationSeconds,
          aspectRatio: pricingAspectRatio,
          generateAudio: pricingGenerateAudio,
          totalInputVideoDurationMs: pricingInputVideoDurationMs ?? 0,
        };
      }

      let pricing: ReturnType<typeof estimateGeneration>;
      try {
        pricing = estimateGeneration({
          price,
          mediaKind: "VIDEO",
          providerModelId: model.providerModelId,
          durationSeconds: pricingDurationSeconds,
          resolution: input.resolution,
          aspectRatio: pricingAspectRatio,
          generateAudio: pricingGenerateAudio,
          totalInputVideoDurationMs: pricingInputVideoDurationMs,
        });
      } catch (error) {
        throw new GenerationError(
          error instanceof Error
            ? error.message
            : "Video pricing is unavailable.",
          409,
        );
      }

      const credits = pricing.reservation.customerCredits;
      try {
        verifyGenerationQuote(
          input.quoteToken,
          {
            organizationId: input.organizationId,
            userId,
            modelId: model.id,
            priceVersionId: price.id,
            parameters: quoteParameters(model.mediaKind, parsed),
          },
          credits,
          now,
        );
      } catch (error) {
        throw new GenerationError(
          error instanceof Error ? error.message : "Quote is invalid.",
          409,
        );
      }

      await assertWithinMonthlySpendingCap(tx, {
        organizationId: input.organizationId,
        userId,
        cap: member.monthlySpendingCapCredits,
        additionalCredits: credits,
        now,
      });

      const outputExtension = input.outputFormat === "mov" ? "mov" : "mp4";
      const outputMimeType =
        input.outputFormat === "mov" ? "video/quicktime" : "video/mp4";
      const lastFrameReservation = input.returnLastFrame
        ? BigInt(MAX_IMAGE_BYTES)
        : 0n;
      await reserveAssetStorage(tx, {
        organizationId: input.organizationId,
        userId,
        proposedBytes: BigInt(MAX_VIDEO_BYTES) + lastFrameReservation,
      });

      const wallet = await tx.wallet.findUnique({
        where: { organizationId: input.organizationId },
      });
      if (!wallet)
        throw new GenerationError("Workspace wallet is unavailable.");

      const job = await tx.generationJob.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId ?? null,
          templateId,
          createdById: userId,
          providerModelId: model.id,
          priceVersionId: price.id,
          idempotencyKey: key,
          requestPayload: payload as Prisma.InputJsonObject,
          status: "QUOTED",
          quotedAt: now,
          billableQuantity: pricingDurationSeconds,
          quotedUnits: pricing.units,
        },
      });

      if (input.sources.length) {
        await tx.generationInputAsset.createMany({
          data: input.sources.map((source) => ({
            generationJobId: job.id,
            assetId: source.assetId,
            position: source.position,
            role: source.role as VideoSourceRole,
          })),
          skipDuplicates: true,
        });
      }

      await reserveCreditsForJob(tx, {
        walletId: wallet.id,
        amountCredits: credits,
        idempotencyKey: `generation-reserve-${job.id}`,
        jobId: job.id,
      });

      const privateSource = assets.some(
        (asset) => asset.purpose === "REFERENCE_INPUT",
      );
      const lineageSource =
        input.sources.find((source) => source.role === "SOURCE_VIDEO") ??
        input.sources.find((source) => source.role === "REFERENCE_VIDEO") ??
        input.sources.find((source) => source.role === "FIRST_FRAME") ??
        input.sources[0];
      const videoAsset = await tx.asset.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId ?? null,
          storageOwnerUserId: userId,
          createdById: userId,
          generationJobId: job.id,
          generationOutputIndex: 0,
          sourceAssetId: lineageSource?.assetId ?? null,
          purpose: privateSource ? "REFERENCE_INPUT" : "GENERAL",
          mediaKind: "VIDEO",
          sourceType: "GENERATED",
          storageProvider: "LOCAL",
          name: defaultAssetName("VIDEO", "GENERATED"),
          objectKey: `${job.id}.${outputExtension}`,
          mimeType: outputMimeType,
          byteSize: BigInt(MAX_VIDEO_BYTES),
          status: "PENDING",
        },
      });

      if (input.returnLastFrame) {
        await tx.asset.create({
          data: {
            organizationId: input.organizationId,
            projectId: input.projectId ?? null,
            storageOwnerUserId: userId,
            createdById: userId,
            generationJobId: job.id,
            generationOutputIndex: 1,
            sourceAssetId: videoAsset.id,
            purpose: privateSource ? "REFERENCE_INPUT" : "GENERAL",
            mediaKind: "IMAGE",
            sourceType: "GENERATED",
            storageProvider: "LOCAL",
            name: "Generated video last frame",
            objectKey: `${job.id}-last-frame.jpg`,
            mimeType: "image/jpeg",
            byteSize: BigInt(MAX_IMAGE_BYTES),
            status: "PENDING",
          },
        });
      }

      await tx.auditEvent.create({
        data: {
          actorUserId: userId,
          organizationId: input.organizationId,
          action: "generation.queued",
          targetType: "GenerationJob",
          targetId: job.id,
          metadata: {
            schemaVersion: isV2 ? 2 : 1,
            workflow: input.workflow,
            sourceCount: input.sources.length,
            totalInputVideoDurationMs,
            totalInputAudioDurationMs,
          },
        },
      });
      return tx.generationJob.update({
        where: { id: job.id },
        data: { status: "QUEUED", queuedAt: now },
      });
    },
    { isolationLevel: "ReadCommitted", timeout: 15_000 },
  );
}

export async function createVoiceJob(userId: string, raw: unknown) {
  const input = voiceRequestSchema.parse(raw);
  const presetVoice = (() => {
    try {
      return resolvePresetVoice(input.voiceKey);
    } catch (error) {
      if (error instanceof VoiceResolutionError) {
        throw new GenerationError(error.message, 400);
      }
      throw error;
    }
  })();
  const billableCharacters = countBillableCharacters(input.text);
  if (billableCharacters <= 0) {
    throw new GenerationError(
      "Voice synthesis text must contain at least one billable character.",
      400,
    );
  }

  const payload = {
    text: input.text,
    voiceKey: presetVoice.key,
    speaker: presetVoice.speakerId,
    speechRate: input.speechRate,
    format: input.format,
  };
  const key = createHash("sha256")
    .update(`${input.organizationId}:${userId}:${input.idempotencyKey}`)
    .digest("hex");

  return db.$transaction(
    async (tx) => {
      // Serialize budget, quota and duplicate-request checks with organization mutations.
      await tx.$queryRaw`SELECT id FROM Organization WHERE id = ${input.organizationId} FOR UPDATE`;
      const member = await requireMembership(
        tx,
        input.organizationId,
        userId,
        true,
      );
      const templateId = await resolveGenerationTemplateId(
        tx,
        input.templateId,
        "VOICE",
      );
      const existing = await tx.generationJob.findUnique({
        where: { idempotencyKey: key },
      });
      if (existing) {
        if (
          existing.projectId !== (input.projectId ?? null) ||
          existing.templateId !== templateId ||
          existing.providerModelId !== input.modelId ||
          existing.priceVersionId !== input.priceVersionId ||
          JSON.stringify(existing.requestPayload) !== JSON.stringify(payload)
        ) {
          const old = existing.requestPayload as typeof payload;
          if (
            existing.projectId !== (input.projectId ?? null) ||
            existing.templateId !== templateId ||
            existing.providerModelId !== input.modelId ||
            existing.priceVersionId !== input.priceVersionId ||
            Object.entries(payload).some(
              ([k, v]) => old[k as keyof typeof payload] !== v,
            )
          )
            throw new GenerationError(
              "Request key was already used for different inputs.",
              409,
            );
        }
        return existing;
      }
      await assertAssignableProject(tx, input.organizationId, input.projectId);
      const now = new Date();
      const model = await tx.providerModel.findFirst({
        where: {
          id: input.modelId,
          enabled: true,
          provider: "BYTEPLUS",
          mediaKind: "VOICE",
          providerModelId: { in: voiceModelIds },
        },
        include: {
          priceVersions: {
            where: {
              effectiveFrom: { lte: now },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
            },
            orderBy: { effectiveFrom: "desc" },
            take: 1,
          },
        },
      });
      const price = model?.priceVersions[0];
      if (!model || !price || price.id !== input.priceVersionId)
        throw new GenerationError(
          "Model or price changed. Refresh the Studio and try again.",
          409,
        );
      if (!presetVoice.supportedModels.includes(model.providerModelId)) {
        throw new GenerationError(
          "Selected voice is not compatible with this model.",
          400,
        );
      }

      const unitQuantity = BigInt(price.unitQuantity ?? 1000);
      const units =
        price.pricingDimension === "CHARACTER"
          ? calculateBillableUnits(BigInt(billableCharacters), unitQuantity)
          : 1n;
      const scaledCost = price.providerCostMicroUsd * units;
      const credits = priceCredits({
        ...price,
        providerCostMicroUsd: scaledCost,
      });

      try {
        verifyGenerationQuote(
          input.quoteToken,
          {
            organizationId: input.organizationId,
            userId,
            modelId: model.id,
            priceVersionId: price.id,
            parameters: quoteParameters(model.mediaKind, input),
          },
          credits,
          now,
        );
      } catch (error) {
        throw new GenerationError(
          error instanceof Error ? error.message : "Quote is invalid.",
          409,
        );
      }
      await assertWithinMonthlySpendingCap(tx, {
        organizationId: input.organizationId,
        userId,
        cap: member.monthlySpendingCapCredits,
        additionalCredits: credits,
        now,
      });
      await reserveAssetStorage(tx, {
        organizationId: input.organizationId,
        userId,
        proposedBytes: BigInt(MAX_AUDIO_BYTES),
      });
      const wallet = await tx.wallet.findUnique({
        where: { organizationId: input.organizationId },
      });
      if (!wallet)
        throw new GenerationError("Workspace wallet is unavailable.");
      const job = await tx.generationJob.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId ?? null,
          templateId,
          createdById: userId,
          providerModelId: model.id,
          priceVersionId: price.id,
          idempotencyKey: key,
          requestPayload: payload,
          status: "QUOTED",
          quotedAt: now,
          billableQuantity: billableCharacters,
          quotedUnits: Number(units),
        },
      });
      await reserveCreditsForJob(tx, {
        walletId: wallet.id,
        amountCredits: credits,
        idempotencyKey: `generation-reserve-${job.id}`,
        jobId: job.id,
      });
      await tx.asset.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId ?? null,
          storageOwnerUserId: userId,
          createdById: userId,
          generationJobId: job.id,
          mediaKind: "AUDIO",
          sourceType: "GENERATED",
          storageProvider: "LOCAL",
          name: defaultAssetName("AUDIO", "GENERATED"),
          objectKey: `${job.id}.mp3`,
          mimeType: "audio/mpeg",
          byteSize: BigInt(MAX_AUDIO_BYTES),
          status: "PENDING",
        },
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: userId,
          organizationId: input.organizationId,
          action: "generation.queued",
          targetType: "GenerationJob",
          targetId: job.id,
        },
      });
      return tx.generationJob.update({
        where: { id: job.id },
        data: { status: "QUEUED", queuedAt: now },
      });
    },
    { isolationLevel: "ReadCommitted", timeout: 15000 },
  );
}

export * from "./estimate";
