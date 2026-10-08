import { db } from "@aiwa/db";
import { supportsStudioTask, type StudioTask } from "@aiwa/providers";
import {
  createImageJob,
  createVideoJob,
  createVoiceJob,
  estimateAuthorizedGeneration,
  imageRequestSchema,
  issueGenerationQuote,
  quoteParameters,
  videoRequestSchema,
  voiceRequestSchema,
} from "@aiwa/generation";
import type {
  OrchestrationToolAdapter,
  ToolAdapterContext,
  ToolAdapterEstimateInput,
  ToolAdapterAdmitInput,
  ToolAdapterExecutionStatus,
} from "./index";
import type {
  OrchestrationTask,
  StepOutput,
  StepQuote,
} from "../contracts/index";
import { computeCanonicalRequestHash } from "../approval/index";

type Kind = "IMAGE" | "VIDEO" | "VOICE";

function kindForTask(task: OrchestrationTask): Kind {
  if (["image-generation", "image-edit", "image-variation"].includes(task))
    return "IMAGE";
  if (task === "video-generation") return "VIDEO";
  if (task === "speech-synthesis") return "VOICE";
  throw new Error("Unsupported generation task.");
}

export function buildGenerationAdmissionRequest(
  ctx: ToolAdapterContext,
  input: ToolAdapterEstimateInput,
  priceVersionId: string,
) {
  const common = {
    organizationId: ctx.organizationId,
    modelId: input.modelId,
    priceVersionId,
    idempotencyKey: ctx.idempotencyKey,
  };
  const p = input.payload;
  if (kindForTask(input.task) === "IMAGE") {
    if (input.task !== "image-generation" && input.sourceAssetIds.length === 0)
      throw new Error("Image edits and variations require a source image.");
    return imageRequestSchema.parse({
      ...common,
      prompt: p.prompt,
      aspectRatio: p.aspectRatio ?? "1:1",
      resolution: p.resolution ?? "2K",
      outputCount: p.outputCount ?? 1,
      referenceAssetIds: input.sourceAssetIds,
      ...(p.localeIntent ? { localeIntent: p.localeIntent } : {}),
    });
  }
  if (kindForTask(input.task) === "VIDEO") {
    if (input.sourceAssetIds.length > 1)
      throw new Error(
        "This video adapter supports a single first-frame source.",
      );
    return videoRequestSchema.parse({
      ...common,
      schemaVersion: 2,
      workflow: input.sourceAssetIds.length ? "FRAME_TO_VIDEO" : "GENERATE",
      prompt: p.prompt,
      aspectRatio: input.sourceAssetIds.length
        ? "adaptive"
        : (p.aspectRatio ?? "16:9"),
      resolution: p.resolution ?? "720p",
      durationSeconds: p.durationSeconds ?? 5,
      generateAudio: false,
      outputFormat: "mp4",
      returnLastFrame: false,
      sources: input.sourceAssetIds.map((assetId, position) => ({
        assetId,
        role: "FIRST_FRAME",
        position,
      })),
      ...(p.localeIntent ? { localeIntent: p.localeIntent } : {}),
    });
  }
  if (input.sourceAssetIds.length)
    throw new Error("TTS does not accept source media.");
  return voiceRequestSchema.parse({
    ...common,
    text: p.text,
    voiceKey: p.voiceKey ?? "jasper",
    speechRate: p.speechRate ?? 1,
    format: "mp3",
    ...(p.localeIntent ? { localeIntent: p.localeIntent } : {}),
  });
}

export class GenerationToolAdapter implements OrchestrationToolAdapter {
  readonly supportedTasks: readonly OrchestrationTask[] = [
    "image-generation",
    "image-edit",
    "image-variation",
    "video-generation",
    "speech-synthesis",
  ];

  async validate(input: ToolAdapterEstimateInput) {
    if (!this.supportedTasks.includes(input.task))
      return { valid: false, error: "Unsupported task." };
    if (
      input.sourceAssetIds.length > 14 ||
      new Set(input.sourceAssetIds).size !== input.sourceAssetIds.length
    )
      return { valid: false, error: "Invalid or repeated source assets." };
    try {
      buildGenerationAdmissionRequest(
        {
          organizationId: "validation",
          userId: "validation",
          idempotencyKey: "00000000-0000-4000-8000-000000000000",
        },
        { ...input, modelId: input.modelId ?? "validation" },
        "validation",
      );
      return { valid: true };
    } catch (e) {
      return {
        valid: false,
        error: e instanceof Error ? e.message : "Invalid generation request.",
      };
    }
  }

  async estimate(
    ctx: ToolAdapterContext,
    input: ToolAdapterEstimateInput,
  ): Promise<StepQuote> {
    if (!this.supportedTasks.includes(input.task) || !input.modelId)
      throw new Error("Select a compatible model.");
    const now = new Date();
    const model = await db.providerModel.findFirst({
      where: {
        id: input.modelId,
        mediaKind: kindForTask(input.task),
        enabled: true,
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
    if (!model || !price)
      throw new Error("Model or active pricing unavailable.");
    const task: StudioTask = kindForTask(input.task) === "IMAGE"
      ? "image-generation" : kindForTask(input.task) === "VIDEO"
        ? "video-generation" : "speech-synthesis";
    const capabilities = (model.capabilities ?? {}) as Record<string, boolean | string | number>;
    if (!supportsStudioTask({
      id: model.providerModelId, provider: model.provider,
      mediaKind: model.mediaKind, capabilities,
    }, task)) throw new Error("Model does not advertise the requested Studio task.");
    if (kindForTask(input.task) === "VIDEO" && capabilities.talkingAvatar === true)
      throw new Error("Talking-avatar models require the dedicated spokesperson workflow.");
    if (input.sourceAssetIds.length && kindForTask(input.task) === "IMAGE" &&
      capabilities.referenceImages !== true)
      throw new Error("This image model does not support reference media.");
    if (input.sourceAssetIds.length && kindForTask(input.task) === "VIDEO" &&
      capabilities.firstFrame !== true)
      throw new Error("This video model does not support first-frame input.");
    if (kindForTask(input.task) === "IMAGE" &&
      Number(input.payload.outputCount ?? 1) > 4)
      throw new Error("Orchestrated image steps are limited to four outputs.");
    const request = buildGenerationAdmissionRequest(ctx, input, price.id);
    const estimate = await estimateAuthorizedGeneration(
      model,
      price,
      {
        ...request,
        units: input.task.startsWith("image-")
          ? Number(input.payload.outputCount ?? 1)
          : 1,
        referenceAssetIds: kindForTask(input.task) === "IMAGE" ? [...input.sourceAssetIds] : [],
      },
      ctx.organizationId,
      ctx.userId,
    );
    const signed = issueGenerationQuote(
      {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        modelId: model.id,
        priceVersionId: price.id,
        parameters: quoteParameters(model.mediaKind, request),
      },
      estimate.reservation.customerCredits,
    );
    return {
      ...signed,
      modelId: model.id,
      provider: model.provider,
      priceVersionId: price.id,
      pricingDimension:
        model.mediaKind === "IMAGE"
          ? "REQUEST"
          : model.mediaKind === "VOICE"
            ? "CHARACTER"
            : "SECOND",
      unitQuantity: 1,
      estimatedCredits: estimate.quote.customerCredits.toString(),
      maximumChargeCredits: estimate.reservation.customerCredits.toString(),
      requestHash: computeCanonicalRequestHash({
        task: input.task,
        modelId: model.id,
        payload: input.payload,
        sourceAssetIds: input.sourceAssetIds,
      }),
    };
  }

  async admit(ctx: ToolAdapterContext, input: ToolAdapterAdmitInput) {
    if (
      !this.supportedTasks.includes(input.task) ||
      input.modelId !== input.quote.modelId
    )
      throw new Error("The approved model does not match the request.");
    const request = buildGenerationAdmissionRequest(
      ctx,
      { ...input, modelId: input.modelId },
      input.quote.priceVersionId,
    );
    const expectedHash = computeCanonicalRequestHash({
      task: input.task,
      modelId: input.modelId,
      payload: input.payload,
      sourceAssetIds: input.sourceAssetIds,
    });
    if (expectedHash !== input.quote.requestHash)
      throw new Error("Approved inputs changed.");
    const quoted = { ...request, quoteToken: input.quote.quoteToken };
    const job =
      kindForTask(input.task) === "IMAGE"
        ? await createImageJob(ctx.userId, quoted)
        : kindForTask(input.task) === "VIDEO"
          ? await createVideoJob(ctx.userId, quoted)
          : await createVoiceJob(ctx.userId, quoted);
    return {
      jobId: job.id,
      status:
        job.status === "PROCESSING"
          ? ("RUNNING" as const)
          : ("QUEUED" as const),
    };
  }

  async getStatus(
    ctx: ToolAdapterContext,
    jobId: string,
  ): Promise<ToolAdapterExecutionStatus> {
    const job = await db.generationJob.findFirst({
      where: {
        id: jobId,
        organizationId: ctx.organizationId,
        createdById: ctx.userId,
      },
      include: {
        assets: {
          where: { status: "READY", deletedAt: null },
          orderBy: { generationOutputIndex: "asc" },
        },
      },
    });
    if (!job)
      return {
        status: "MANUAL_REVIEW",
        error: "Job unavailable or no longer authorized.",
      };
    if (job.status === "SUCCEEDED")
      return {
        status: "SUCCEEDED",
        jobId,
        outputs: job.assets.map((asset) => ({
          outputIndex: asset.generationOutputIndex ?? 0,
          assetId: asset.id,
          mimeType: asset.mimeType,
        })),
      };
    if (job.status === "FAILED")
      return { status: "FAILED", jobId, error: "Generation failed." };
    if (job.status === "MANUAL_REVIEW")
      return {
        status: "MANUAL_REVIEW",
        jobId,
        error: "Provider acceptance requires review.",
      };
    return {
      status: job.status === "PROCESSING" ? "RUNNING" : "QUEUED",
      jobId,
    };
  }

  async collectOutputs(
    ctx: ToolAdapterContext,
    jobId: string,
  ): Promise<StepOutput[]> {
    const result = await this.getStatus(ctx, jobId);
    return result.status === "SUCCEEDED" ? (result.outputs ?? []) : [];
  }
}
