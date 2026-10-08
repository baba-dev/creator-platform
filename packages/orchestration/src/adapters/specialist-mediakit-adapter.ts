import { db } from "@aiwa/db";
import { quoteProviderToolPrice } from "@aiwa/credits";
import {
  createProviderToolExecution,
  issueGenerationQuote,
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

  async validate(input: ToolAdapterEstimateInput) {
    if (
      !this.supportedTasks.includes(input.task) ||
      input.sourceAssetIds.length !== 1
    )
      return {
        valid: false,
        error: "Choose exactly one source video for a supported MediaKit tool.",
      };
    return { valid: true };
  }

  async estimate(
    ctx: ToolAdapterContext,
    input: ToolAdapterEstimateInput,
  ): Promise<StepQuote> {
    const valid = await this.validate(input);
    if (!valid.valid) throw new Error(valid.error);
    const asset = await db.asset.findFirst({
      where: {
        id: input.sourceAssetIds[0]!,
        organizationId: ctx.organizationId,
        status: "READY",
        deletedAt: null,
        mediaKind: "VIDEO",
        OR: [
          { purpose: { not: "REFERENCE_INPUT" } },
          { storageOwnerUserId: ctx.userId },
        ],
      },
      select: { id: true, durationMs: true },
    });
    if (!asset || !asset.durationMs || asset.durationMs <= 0)
      throw new Error(
        "Source video is unavailable or has no verified duration.",
      );
    const now = new Date();
    const tool = await db.providerTool.findFirst({
      where: {
        provider: "BYTEPLUS",
        providerToolId: input.task,
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
    const price = tool?.priceVersions[0];
    if (!tool || !price)
      throw new Error("MediaKit tool or pricing is unavailable.");
    const quantity =
      price.pricingMetric === "REQUEST"
        ? 1
        : Math.ceil(asset.durationMs / 1000);
    const cost = quoteProviderToolPrice({
      providerCostMicroUsd: price.providerCostMicroUsd,
      pricingMetric: price.pricingMetric,
      unitQuantity: price.unitQuantity,
      billableQuantity: quantity,
      exchangeRate: {
        baisaNumerator: price.fxBaisaNumerator,
        baisaDenominator: price.fxBaisaDenominator,
      },
      targetGrossMarginBps: price.targetMarginBps,
      creditsPerBaisa: price.creditsPerBaisa,
    });
    const requestHash = computeCanonicalRequestHash({
      task: input.task,
      modelId: tool.id,
      payload: input.payload,
      sourceAssetIds: input.sourceAssetIds,
    });
    const signed = issueGenerationQuote(
      {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        modelId: tool.id,
        priceVersionId: price.id,
        parameters: { task: input.task, quantity, requestHash },
      },
      cost.customerCredits,
    );
    return {
      ...signed,
      modelId: tool.id,
      provider: "BYTEPLUS",
      priceVersionId: price.id,
      pricingDimension:
        price.pricingMetric === "REQUEST" ? "REQUEST" : "SECOND",
      unitQuantity: quantity,
      estimatedCredits: cost.customerCredits.toString(),
      maximumChargeCredits: cost.customerCredits.toString(),
      requestHash,
    };
  }

  async admit(ctx: ToolAdapterContext, input: ToolAdapterAdmitInput) {
    if (
      !this.supportedTasks.includes(input.task) ||
      input.sourceAssetIds.length !== 1
    )
      throw new Error("Invalid source video or unsupported tool.");
    const tool = await db.providerTool.findFirst({
      where: { id: input.modelId, providerToolId: input.task, enabled: true },
      select: { id: true },
    });
    if (!tool || input.quote.modelId !== tool.id)
      throw new Error("MediaKit tool selection changed.");
    const hash = computeCanonicalRequestHash({
      task: input.task,
      modelId: tool.id,
      payload: input.payload,
      sourceAssetIds: input.sourceAssetIds,
    });
    if (hash !== input.quote.requestHash)
      throw new Error("Approved MediaKit inputs changed.");
    const execution = await createProviderToolExecution(ctx.userId, {
      organizationId: ctx.organizationId,
      toolId: tool.id,
      priceVersionId: input.quote.priceVersionId,
      idempotencyKey: ctx.idempotencyKey,
      quotedQuantity: input.quote.unitQuantity,
      input: input.payload,
      sourceAssets: input.sourceAssetIds.map((assetId, position) => ({
        assetId,
        role: "SOURCE_VIDEO" as const,
        position,
      })),
    });
    return { jobId: execution.id, status: "QUEUED" as const };
  }

  async getStatus(
    ctx: ToolAdapterContext,
    jobId: string,
  ): Promise<ToolAdapterExecutionStatus> {
    const exec = await db.providerToolExecution.findFirst({
      where: {
        id: jobId,
        organizationId: ctx.organizationId,
        createdById: ctx.userId,
      },
      include: {
        outputAssets: {
          where: { status: "READY", deletedAt: null },
          orderBy: { providerToolOutputIndex: "asc" },
        },
      },
    });
    if (!exec)
      return {
        status: "MANUAL_REVIEW",
        error: "Tool execution unavailable or unauthorized.",
      };
    if (exec.status === "SUCCEEDED")
      return {
        status: "SUCCEEDED",
        jobId,
        outputs: exec.outputAssets.map((asset, index) => ({
          outputIndex: asset.providerToolOutputIndex ?? index,
          assetId: asset.id,
          mimeType: asset.mimeType,
        })),
      };
    if (exec.status === "FAILED")
      return { status: "FAILED", jobId, error: "MediaKit execution failed." };
    if (exec.status === "MANUAL_REVIEW")
      return {
        status: "MANUAL_REVIEW",
        jobId,
        error: "MediaKit needs review.",
      };
    return { status: "RUNNING", jobId };
  }

  async collectOutputs(
    ctx: ToolAdapterContext,
    jobId: string,
  ): Promise<StepOutput[]> {
    const result = await this.getStatus(ctx, jobId);
    return result.status === "SUCCEEDED" ? (result.outputs ?? []) : [];
  }
}
