import { createHash } from "node:crypto";
import { hasOrganizationPermission } from "@aiwa/authz";
import { defaultAssetName, reserveAssetStorage } from "@aiwa/assets";
import {
  calculateBillableUnits,
  calculateVideoPricing,
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

export * from "./voices";
export * from "./reconciliation";
export * from "./cancel";

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
    resolution: z.enum(["2K", "3K", "4K"]).default("2K"),
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

export const videoRequestSchema = z
  .object({
    organizationId: z.string().min(1).max(100),
    projectId: z.string().min(1).max(100).nullable().optional(),
    modelId: z.string().min(1).max(100),
    priceVersionId: z.string().min(1).max(100),
    idempotencyKey: z.uuid(),
    templateId: z.string().min(1).max(100).optional(),
    prompt: z.string().trim().min(1).max(2000),
    aspectRatio: z.enum(["16:9", "9:16", "1:1", "4:3", "3:4"]),
    resolution: z.enum(["720p", "1080p"]).default("1080p"),
    durationSeconds: z.number().int().min(1).max(30),
    generateAudio: z.boolean().default(false),
  })
  .strict();

export const voiceRequestSchema = z
  .object({
    organizationId: z.string().min(1).max(100),
    projectId: z.string().min(1).max(100).nullable().optional(),
    modelId: z.string().min(1).max(100),
    priceVersionId: z.string().min(1).max(100),
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

async function resolveGenerationTemplateId(
  tx: Prisma.TransactionClient,
  templateId: string | undefined,
  mediaKind: "IMAGE" | "VIDEO" | "VOICE",
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
          JSON.stringify(existing.requestPayload) !== JSON.stringify(payload)
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
              storageOwnerUserId: userId,
              purpose: "REFERENCE_INPUT",
              mediaKind: "IMAGE",
              status: "READY",
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

      const creditsPerImage = priceCredits(price);
      const credits = creditsPerImage * BigInt(input.outputCount);
      const { start, end } = muscatCalendarMonth(now);
      const jobs = await tx.generationJob.findMany({
        where: {
          organizationId: input.organizationId,
          createdById: userId,
          createdAt: { gte: start, lt: end },
          status: { notIn: ["CANCELLED", "FAILED", "DRAFT"] },
        },
        select: { status: true, reservedCredits: true, chargedCredits: true },
      });
      const spent = jobs.reduce(
        (n, j) =>
          n + (j.status === "SUCCEEDED" ? j.chargedCredits : j.reservedCredits),
        0n,
      );
      if (
        member.monthlySpendingCapCredits !== null &&
        spent + credits > member.monthlySpendingCapCredits
      )
        throw new GenerationError("Monthly spending cap exceeded.");
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
      const extension =
        model.providerModelId === "seedream-4-5-251128" ? "jpg" : "png";
      const mimeType =
        model.providerModelId === "seedream-4-5-251128"
          ? "image/jpeg"
          : "image/png";
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
  const input = videoRequestSchema.parse(raw);
  const payload = {
    prompt: input.prompt,
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    durationSeconds: input.durationSeconds,
    generateAudio: input.generateAudio,
    watermark: false,
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
          `durationSeconds:${input.durationSeconds}`,
        )
      ) {
        throw new GenerationError("Duration is not supported by this model.");
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
        input.generateAudio &&
        !hasModelCapability(model.capabilities, "generateAudio")
      ) {
        throw new GenerationError(
          "Audio generation is not supported by this model.",
        );
      }

      if (
        price.pricingDimension !== "SECOND" &&
        price.pricingDimension !== "REQUEST"
      ) {
        throw new GenerationError(
          "Video model has an incompatible pricing configuration. Ask an administrator to publish a valid video price.",
          409,
        );
      }

      const pricing = calculateVideoPricing({
        providerCostMicroUsd: price.providerCostMicroUsd,
        durationSeconds: input.durationSeconds,
        resolution: input.resolution,
        generateAudio: input.generateAudio,
        pricingDimension: price.pricingDimension,
        unitQuantity: price.unitQuantity,
        exchangeRate: {
          baisaNumerator: price.fxBaisaNumerator,
          baisaDenominator: price.fxBaisaDenominator,
        },
        targetGrossMarginBps: price.targetMarginBps,
        creditsPerBaisa: price.creditsPerBaisa,
      });
      const credits = pricing.quote.customerCredits;
      const { start, end } = muscatCalendarMonth(now);
      const jobs = await tx.generationJob.findMany({
        where: {
          organizationId: input.organizationId,
          createdById: userId,
          createdAt: { gte: start, lt: end },
          status: { notIn: ["CANCELLED", "FAILED", "DRAFT"] },
        },
        select: { status: true, reservedCredits: true, chargedCredits: true },
      });
      const spent = jobs.reduce(
        (n, j) =>
          n + (j.status === "SUCCEEDED" ? j.chargedCredits : j.reservedCredits),
        0n,
      );
      if (
        member.monthlySpendingCapCredits !== null &&
        spent + credits > member.monthlySpendingCapCredits
      )
        throw new GenerationError("Monthly spending cap exceeded.");
      await reserveAssetStorage(tx, {
        organizationId: input.organizationId,
        userId,
        proposedBytes: BigInt(MAX_VIDEO_BYTES),
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
          billableQuantity: input.durationSeconds,
          quotedUnits: Number(pricing.durationUnits),
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
          mediaKind: "VIDEO",
          sourceType: "GENERATED",
          storageProvider: "LOCAL",
          name: defaultAssetName("VIDEO", "GENERATED"),
          objectKey: `${job.id}.mp4`,
          mimeType: "video/mp4",
          byteSize: BigInt(MAX_VIDEO_BYTES),
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
      // QUEUED is the durable outbox; the worker republishes it after Redis outages.
      return tx.generationJob.update({
        where: { id: job.id },
        data: { status: "QUEUED", queuedAt: now },
      });
    },
    { isolationLevel: "ReadCommitted", timeout: 15000 },
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

      const { start, end } = muscatCalendarMonth(now);
      const jobs = await tx.generationJob.findMany({
        where: {
          organizationId: input.organizationId,
          createdById: userId,
          createdAt: { gte: start, lt: end },
          status: { notIn: ["CANCELLED", "FAILED", "DRAFT"] },
        },
        select: { status: true, reservedCredits: true, chargedCredits: true },
      });
      const spent = jobs.reduce(
        (n, j) =>
          n + (j.status === "SUCCEEDED" ? j.chargedCredits : j.reservedCredits),
        0n,
      );
      if (
        member.monthlySpendingCapCredits !== null &&
        spent + credits > member.monthlySpendingCapCredits
      )
        throw new GenerationError("Monthly spending cap exceeded.");
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
