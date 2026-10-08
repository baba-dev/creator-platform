import {
  createImageJob,
  createVideoJob,
  createVoiceJob,
  issueGenerationQuote,
  GenerationError,
  db,
} from "@aiwa/generation";
import type {
  OrchestrationToolAdapter,
  ToolAdapterContext,
  ToolAdapterEstimateInput,
  ToolAdapterAdmitInput,
  ToolAdapterExecutionStatus,
} from "../adapters/index";
import type {
  StepQuote,
  StepOutput,
  OrchestrationTask,
} from "../contracts/index";
import { computeCanonicalRequestHash } from "../approval/index";

export class GenerationToolAdapter implements OrchestrationToolAdapter {
  readonly supportedTasks: readonly OrchestrationTask[] = [
    "image-generation",
    "image-edit",
    "image-variation",
    "video-generation",
    "speech-synthesis",
  ];

  async validate(
    input: ToolAdapterEstimateInput,
  ): Promise<{ valid: boolean; error?: string }> {
    if (!this.supportedTasks.includes(input.task)) {
      return {
        valid: false,
        error: `Task ${input.task} not supported by GenerationToolAdapter.`,
      };
    }
    if (!input.payload || typeof input.payload !== "object") {
      return { valid: false, error: "Missing or invalid payload." };
    }
    return { valid: true };
  }

  async estimate(
    ctx: ToolAdapterContext,
    input: ToolAdapterEstimateInput,
  ): Promise<StepQuote> {
    const quote = await issueGenerationQuote({
      organizationId: ctx.organizationId,
      modelId: input.modelId ?? "seedream-5-0",
      quantity: 1,
      inputPayload: input.payload,
    });

    const requestHash = computeCanonicalRequestHash({
      task: input.task,
      modelId: quote.modelId,
      payload: input.payload,
      sourceAssetIds: input.sourceAssetIds,
    });

    return {
      quoteId: quote.quoteId,
      quoteToken: quote.quoteToken,
      expiresAt: quote.expiresAt,
      modelId: quote.modelId,
      provider: "byteplus",
      priceVersionId: quote.priceVersionId,
      pricingDimension: quote.pricingDimension ?? "REQUEST",
      unitQuantity: quote.unitQuantity ?? 1,
      estimatedCredits: quote.estimatedCredits,
      maximumChargeCredits: quote.maximumChargeCredits,
      requestHash,
    };
  }

  async admit(
    ctx: ToolAdapterContext,
    input: ToolAdapterAdmitInput,
  ): Promise<{ jobId: string; status: "QUEUED" | "RUNNING" }> {
    let job: { id: string; status: string };

    if (input.task === "video-generation") {
      job = await createVideoJob({
        organizationId: ctx.organizationId,
        createdById: ctx.userId,
        modelId: input.modelId,
        priceVersionId: input.quote.priceVersionId,
        quoteToken: input.quote.quoteToken,
        idempotencyKey: ctx.idempotencyKey,
        prompt: String(input.payload.prompt ?? ""),
        durationSeconds: Number(input.payload.durationSeconds ?? 5),
        aspectRatio: String(input.payload.aspectRatio ?? "16:9"),
        sources: [],
      });
    } else if (input.task === "speech-synthesis") {
      job = await createVoiceJob({
        organizationId: ctx.organizationId,
        createdById: ctx.userId,
        modelId: input.modelId,
        priceVersionId: input.quote.priceVersionId,
        quoteToken: input.quote.quoteToken,
        idempotencyKey: ctx.idempotencyKey,
        text: String(input.payload.text ?? ""),
        voiceKey: String(input.payload.voiceKey ?? "jasper"),
      });
    } else {
      job = await createImageJob({
        organizationId: ctx.organizationId,
        createdById: ctx.userId,
        modelId: input.modelId,
        priceVersionId: input.quote.priceVersionId,
        quoteToken: input.quote.quoteToken,
        idempotencyKey: ctx.idempotencyKey,
        prompt: String(input.payload.prompt ?? ""),
        aspectRatio: String(input.payload.aspectRatio ?? "1:1"),
        resolution: String(input.payload.resolution ?? "2K"),
        outputCount: Number(input.payload.outputCount ?? 1),
      });
    }

    return {
      jobId: job.id,
      status: job.status === "PROCESSING" ? "RUNNING" : "QUEUED",
    };
  }

  async getStatus(
    _ctx: ToolAdapterContext,
    jobId: string,
  ): Promise<ToolAdapterExecutionStatus> {
    const job = await db.generationJob.findUnique({
      where: { id: jobId },
      include: {
        assets: {
          where: { status: "READY", deletedAt: null },
          orderBy: { generationOutputIndex: "asc" },
        },
      },
    });

    if (!job) {
      return { status: "FAILED", error: "Generation job record not found." };
    }

    if (job.status === "SUCCEEDED") {
      return {
        status: "SUCCEEDED",
        jobId: job.id,
        outputs: job.assets.map((asset) => ({
          outputIndex: asset.generationOutputIndex ?? 0,
          assetId: asset.id,
          mimeType: asset.mimeType,
        })),
      };
    }

    if (job.status === "FAILED") {
      return {
        status: "FAILED",
        jobId: job.id,
        error: job.errorMessage ?? "Job failed",
      };
    }

    if (job.status === "MANUAL_REVIEW") {
      return {
        status: "MANUAL_REVIEW",
        jobId: job.id,
        error: job.errorMessage ?? "Job under manual review",
      };
    }

    return {
      status: job.status === "PROCESSING" ? "RUNNING" : "QUEUED",
      jobId: job.id,
    };
  }

  async collectOutputs(
    _ctx: ToolAdapterContext,
    jobId: string,
  ): Promise<StepOutput[]> {
    const job = await db.generationJob.findUnique({
      where: { id: jobId },
      include: {
        assets: {
          where: { status: "READY", deletedAt: null },
          orderBy: { generationOutputIndex: "asc" },
        },
      },
    });

    return (job?.assets ?? []).map((asset) => ({
      outputIndex: asset.generationOutputIndex ?? 0,
      assetId: asset.id,
      mimeType: asset.mimeType,
    }));
  }
}
