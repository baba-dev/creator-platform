import {
  quoteProviderToolPrice,
  submitProviderToolExecution,
  db,
} from "@aiwa/generation";
import type {
  OrchestrationToolAdapter,
  ToolAdapterContext,
  ToolAdapterEstimateInput,
  ToolAdapterAdmitInput,
  ToolAdapterExecutionStatus,
} from "./index";
import type {
  StepQuote,
  StepOutput,
  OrchestrationTask,
} from "../contracts/index";
import { computeCanonicalRequestHash } from "../approval/index";

export class SpecialistMediaKitAdapter implements OrchestrationToolAdapter {
  readonly supportedTasks: readonly OrchestrationTask[] = [
    "matte-portrait-video",
    "assess-video-quality",
    "enhance-video-smoothness",
  ];

  async validate(
    input: ToolAdapterEstimateInput,
  ): Promise<{ valid: boolean; error?: string }> {
    if (!this.supportedTasks.includes(input.task)) {
      return {
        valid: false,
        error: `Task ${input.task} not supported by SpecialistMediaKitAdapter.`,
      };
    }
    if (input.sourceAssetIds.length === 0) {
      return {
        valid: false,
        error: `Task ${input.task} requires at least one source video asset.`,
      };
    }
    return { valid: true };
  }

  async estimate(
    ctx: ToolAdapterContext,
    input: ToolAdapterEstimateInput,
  ): Promise<StepQuote> {
    const quoted = await quoteProviderToolPrice({
      organizationId: ctx.organizationId,
      toolId: input.task,
      quantity: Number(input.payload.durationSeconds ?? 10),
    });

    const requestHash = computeCanonicalRequestHash({
      task: input.task,
      modelId: input.task,
      payload: input.payload,
      sourceAssetIds: input.sourceAssetIds,
    });

    return {
      quoteId: quoted.quoteId,
      quoteToken: quoted.quoteToken,
      expiresAt: quoted.expiresAt,
      modelId: input.task,
      provider: "byteplus-mediakit",
      priceVersionId: quoted.priceVersionId,
      pricingDimension: quoted.pricingDimension as "SECOND" | "REQUEST",
      unitQuantity: quoted.unitQuantity,
      estimatedCredits: quoted.estimatedCredits,
      maximumChargeCredits: quoted.maximumChargeCredits,
      requestHash,
    };
  }

  async admit(
    ctx: ToolAdapterContext,
    input: ToolAdapterAdmitInput,
  ): Promise<{ jobId: string; status: "QUEUED" | "RUNNING" }> {
    const execution = await submitProviderToolExecution({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      toolId: input.task,
      priceVersionId: input.quote.priceVersionId,
      idempotencyKey: ctx.idempotencyKey,
      quotedQuantity: input.quote.unitQuantity,
      input: input.payload,
      sourceAssets: input.sourceAssetIds.map((assetId, index) => ({
        assetId,
        role: "SOURCE_VIDEO" as const,
        position: index,
      })),
    });

    return {
      jobId: execution.id,
      status: "RUNNING",
    };
  }

  async getStatus(
    _ctx: ToolAdapterContext,
    jobId: string,
  ): Promise<ToolAdapterExecutionStatus> {
    const exec = await db.providerToolExecution.findUnique({
      where: { id: jobId },
      include: {
        outputAsset: true,
      },
    });

    if (!exec) {
      return {
        status: "FAILED",
        error: "Provider tool execution record not found.",
      };
    }

    if (exec.status === "SUCCEEDED") {
      return {
        status: "SUCCEEDED",
        jobId: exec.id,
        outputs: exec.outputAsset
          ? [
              {
                outputIndex: 0,
                assetId: exec.outputAsset.id,
                mimeType: exec.outputAsset.mimeType,
              },
            ]
          : [],
      };
    }

    if (exec.status === "FAILED") {
      return {
        status: "FAILED",
        jobId: exec.id,
        error: exec.errorMessage ?? "Specialist tool failed",
      };
    }

    return {
      status: "RUNNING",
      jobId: exec.id,
    };
  }

  async collectOutputs(
    _ctx: ToolAdapterContext,
    jobId: string,
  ): Promise<StepOutput[]> {
    const exec = await db.providerToolExecution.findUnique({
      where: { id: jobId },
      include: {
        outputAsset: true,
      },
    });

    if (!exec?.outputAsset) return [];
    return [
      {
        outputIndex: 0,
        assetId: exec.outputAsset.id,
        mimeType: exec.outputAsset.mimeType,
      },
    ];
  }
}
