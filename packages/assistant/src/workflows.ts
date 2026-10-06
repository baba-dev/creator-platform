import { createHash } from "node:crypto";
import { db, Prisma } from "@aiwa/db";
import {
  createImageJob,
  createVideoJob,
  createVoiceJob,
  estimateAuthorizedGeneration,
  issueGenerationQuote,
  quoteParameters,
  GenerationError,
  imageRequestSchema,
  voiceRequestSchema,
  videoRequestSchema,
} from "@aiwa/generation";
import { z } from "zod";
import { InsufficientCreditsError } from "@aiwa/credits";
import { AssetQuotaExceededError } from "@aiwa/assets";
import { accessibleAssets, requirePixelAccess } from "./access";
import type { AssistantToolContext } from "./tools/types";

const id = z.string().min(1).max(100);
export const pixelStepSchema = z
  .object({
    kind: z.enum(["IMAGE", "VIDEO", "VOICE"]),
    modelId: id,
    prompt: z.string().trim().min(1).max(2000),
    aspectRatio: z
      .enum([
        "1:1",
        "16:9",
        "9:16",
        "4:3",
        "3:4",
        "3:2",
        "2:3",
        "21:9",
        "adaptive",
      ])
      .default("1:1"),
    resolution: z
      .enum(["1K", "1.5K", "2K", "3K", "4K", "480p", "720p", "1080p"])
      .default("2K"),
    outputCount: z.number().int().min(1).max(4).default(1),
    durationSeconds: z.number().int().min(1).max(30).default(5),
    sourceAssetId: id.optional(),
    sourceStep: z.number().int().min(1).max(5).optional(),
    sourceOutput: z.number().int().min(1).max(4).optional(),
    voiceKey: z.string().min(1).max(100).default("jasper"),
    speechRate: z.number().min(0.5).max(2).default(1),
  })
  .strict()
  .superRefine((step, context) => {
    if (step.sourceAssetId && step.sourceStep)
      context.addIssue({
        code: "custom",
        message: "Choose one source identity.",
      });
    if (step.kind === "VOICE" && (step.sourceAssetId || step.sourceStep))
      context.addIssue({
        code: "custom",
        message: "Speech uses text; it cannot consume an image source.",
      });
    if (step.kind !== "IMAGE" && step.outputCount !== 1)
      context.addIssue({
        code: "custom",
        message: "Only image steps support multiple outputs.",
      });
  });
export const pixelWorkflowSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    steps: z.array(pixelStepSchema).min(1).max(5),
  })
  .strict()
  .superRefine((plan, context) => {
    plan.steps.forEach((step, index) => {
      if (step.sourceStep && step.sourceStep >= index + 1)
        context.addIssue({
          code: "custom",
          path: ["steps", index, "sourceStep"],
          message: "Sources must refer to an earlier step.",
        });
    });
  });

type SavedQuote = {
  quoteId: string;
  quoteToken: string;
  expiresAt: string;
  maximumChargeCredits: string;
  estimatedCredits: string;
  modelId: string;
  modelName: string;
  priceVersionId: string;
  request: Record<string, unknown>;
  sourceAssetId?: string;
};

// Stable, private namespace prevents overlap with other product actions.
function actionKey(actionId: string) {
  const hex = createHash("sha256")
    .update(`pixel-action:${actionId}`)
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function preparePixelWorkflow(
  ctx: AssistantToolContext,
  raw: unknown,
) {
  await requirePixelAccess(ctx, "generation:create");
  const plan = pixelWorkflowSchema.parse(raw);
  for (const step of plan.steps) {
    const model = await db.providerModel.findFirst({
      where: { id: step.modelId, mediaKind: step.kind, enabled: true },
      select: { id: true },
    });
    if (!model)
      throw new GenerationError(
        "Choose a current model from the live catalog.",
        409,
      );
    if (
      step.sourceAssetId &&
      !(await db.asset.findFirst({
        where: {
          ...accessibleAssets(ctx),
          id: step.sourceAssetId,
          mediaKind: "IMAGE",
        },
        select: { id: true },
      }))
    )
      throw new GenerationError(
        "Source image is unavailable in this workspace.",
        404,
      );
  }
  const existing = await db.pixelWorkflow.findUnique({
    where: {
      threadId_requestKey: {
        threadId: ctx.threadId,
        requestKey: ctx.idempotencyKey,
      },
    },
    include: { actions: { orderBy: { position: "asc" } } },
  });
  if (existing)
    return { workflowId: existing.id, title: existing.title, prepared: true };
  if (
    (await db.pixelWorkflow.count({
      where: {
        threadId: ctx.threadId,
        cancelledAt: null,
        createdAt: { gte: new Date(Date.now() - 86_400_000) },
      },
    })) >= 30
  )
    throw new GenerationError(
      "Too many workflow drafts today. Finish existing work first.",
      429,
    );
  const workflow = await db.pixelWorkflow.upsert({
    where: {
      threadId_requestKey: {
        threadId: ctx.threadId,
        requestKey: ctx.idempotencyKey,
      },
    },
    update: {},
    create: {
      threadId: ctx.threadId,
      requestKey: ctx.idempotencyKey,
      title: plan.title,
      actions: {
        create: plan.steps.map((step, index) => ({
          position: index + 1,
          payload: step,
        })),
      },
    },
  });
  return { workflowId: workflow.id, title: workflow.title, prepared: true };
}

async function actionFor(ctx: AssistantToolContext, actionId: string) {
  await requirePixelAccess(ctx, "generation:create");
  const action = await db.pixelAction.findFirst({
    where: { id: actionId, workflow: { threadId: ctx.threadId } },
    include: {
      workflow: { include: { actions: { orderBy: { position: "asc" } } } },
    },
  });
  if (!action) throw new GenerationError("Action not found.", 404);
  return action;
}

export async function listPixelWorkflows(ctx: AssistantToolContext) {
  await requirePixelAccess(ctx);
  const workflows = await db.pixelWorkflow.findMany({
    where: { threadId: ctx.threadId },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { actions: { orderBy: { position: "asc" } } },
  });
  const ids = workflows.flatMap((w) =>
    w.actions.flatMap((a) => (a.jobId ? [a.jobId] : [])),
  );
  const jobs = ids.length
    ? await db.generationJob.findMany({
        where: {
          id: { in: ids },
          organizationId: ctx.organizationId,
          createdById: ctx.userId,
        },
        select: {
          id: true,
          status: true,
          assets: {
            where: accessibleAssets(ctx),
            orderBy: { generationOutputIndex: "asc" },
            select: {
              id: true,
              mediaKind: true,
              generationOutputIndex: true,
              variants: {
                where: { kind: { in: ["THUMBNAIL", "POSTER"] } },
                take: 1,
                select: { kind: true },
              },
            },
          },
        },
      })
    : [];
  return workflows.map((workflow) => ({
    id: workflow.id,
    title: workflow.title,
    cancelled: Boolean(workflow.cancelledAt),
    actions: workflow.actions.map((action) => {
      const job = jobs.find((j) => j.id === action.jobId);
      const quote = action.quote as SavedQuote | null;
      return {
        id: action.id,
        position: action.position,
        payload: pixelStepSchema.parse(action.payload),
        status: job?.status ?? action.status,
        jobId: action.jobId,
        assets: (job?.assets ?? []).map((asset) => ({
          id: asset.id,
          mediaKind: asset.mediaKind,
          generationOutputIndex: asset.generationOutputIndex,
          previewKind: asset.variants[0]?.kind?.toLowerCase() ?? null,
        })),
        quote: quote
          ? {
              quoteId: quote.quoteId,
              expiresAt: quote.expiresAt,
              maximumChargeCredits: quote.maximumChargeCredits,
              estimatedCredits: quote.estimatedCredits,
              modelName: quote.modelName,
              sourceAssetId: quote.sourceAssetId,
            }
          : null,
      };
    }),
  }));
}

export async function quotePixelAction(
  ctx: AssistantToolContext,
  actionId: string,
  selectedSourceId?: string,
) {
  const action = await actionFor(ctx, actionId);
  if (
    action.workflow.cancelledAt ||
    action.status === "ADMITTING" ||
    action.jobId
  )
    throw new GenerationError(
      "This action cannot be requoted. Refresh its saved status.",
      409,
    );
  const step = pixelStepSchema.parse(action.payload);
  let sourceAssetId = step.sourceAssetId;
  for (const prior of action.workflow.actions.filter(
    (a) => a.position < action.position,
  )) {
    const job = prior.jobId
      ? await db.generationJob.findFirst({
          where: {
            id: prior.jobId,
            organizationId: ctx.organizationId,
            createdById: ctx.userId,
          },
          select: { id: true, status: true },
        })
      : null;
    if (!job || job.status !== "SUCCEEDED")
      throw new GenerationError(
        "Complete the earlier steps before continuing. Partial results are preserved.",
        409,
      );
  }
  if (step.sourceStep) {
    const prior = action.workflow.actions.find(
      (a) => a.position === step.sourceStep,
    );
    const outputs = await db.asset.findMany({
      where: {
        ...accessibleAssets(ctx),
        generationJobId: prior?.jobId ?? "",
        mediaKind: "IMAGE",
      },
      orderBy: { generationOutputIndex: "asc" },
      take: 4,
      select: { id: true },
    });
    // Selection is explicit when the plan did not declare an output number.
    sourceAssetId = step.sourceOutput
      ? outputs[step.sourceOutput - 1]?.id
      : selectedSourceId;
    if (!sourceAssetId || !outputs.some((a) => a.id === sourceAssetId))
      throw new GenerationError(
        "Select an available image from the source step.",
        409,
      );
  }
  if (
    sourceAssetId &&
    !(await db.asset.findFirst({
      where: {
        ...accessibleAssets(ctx),
        id: sourceAssetId,
        mediaKind: "IMAGE",
      },
      select: { id: true },
    }))
  )
    throw new GenerationError("Source image is unavailable.", 404);
  const now = new Date();
  const model = await db.providerModel.findFirst({
    where: { id: step.modelId, enabled: true, mediaKind: step.kind },
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
    throw new GenerationError("Model or pricing is unavailable.", 409);
  const common = {
    organizationId: ctx.organizationId,
    modelId: model.id,
    priceVersionId: price.id,
    idempotencyKey: actionKey(action.id),
  };
  const request =
    step.kind === "IMAGE"
      ? {
          ...common,
          prompt: step.prompt,
          aspectRatio: step.aspectRatio,
          resolution: step.resolution,
          outputCount: step.outputCount,
          referenceAssetIds: sourceAssetId ? [sourceAssetId] : [],
        }
      : step.kind === "VOICE"
        ? {
            ...common,
            text: step.prompt,
            voiceKey: step.voiceKey,
            speechRate: step.speechRate,
            format: "mp3",
          }
        : {
            ...common,
            prompt: step.prompt,
            aspectRatio: sourceAssetId ? "adaptive" : step.aspectRatio,
            resolution: step.resolution,
            durationSeconds: step.durationSeconds,
            generateAudio: false,
            outputFormat: "mp4" as const,
            returnLastFrame: false,
            schemaVersion: 2,
            workflow: sourceAssetId
              ? ("FRAME_TO_VIDEO" as const)
              : ("GENERATE" as const),
            sources: sourceAssetId
              ? [
                  {
                    assetId: sourceAssetId,
                    role: "FIRST_FRAME" as const,
                    position: 0,
                  },
                ]
              : [],
          };
  const estimate = await estimateAuthorizedGeneration(
    model,
    price,
    {
      ...request,
      units: step.outputCount,
      referenceAssetIds:
        sourceAssetId && step.kind === "IMAGE" ? [sourceAssetId] : [],
    },
    ctx.organizationId,
    ctx.userId,
  );
  // Validate the exact admission contract before offering an approval.
  (step.kind === "IMAGE"
    ? imageRequestSchema
    : step.kind === "VIDEO"
      ? videoRequestSchema
      : voiceRequestSchema
  ).parse(request);
  const signed = issueGenerationQuote(
    {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      modelId: model.id,
      priceVersionId: price.id,
      parameters: quoteParameters(step.kind, request),
    },
    estimate.reservation.customerCredits,
  );
  const wallet = await db.wallet.findUnique({
    where: { organizationId: ctx.organizationId },
    select: { balanceCache: true },
  });
  if (!wallet || wallet.balanceCache < estimate.reservation.customerCredits)
    throw new GenerationError(
      "Your available credits are below this step's maximum charge. Top up before approving.",
      409,
    );
  const quote: SavedQuote = {
    ...signed,
    maximumChargeCredits: estimate.reservation.customerCredits.toString(),
    estimatedCredits: estimate.quote.customerCredits.toString(),
    modelId: model.id,
    modelName: model.displayName,
    priceVersionId: price.id,
    request: { ...request, quoteToken: signed.quoteToken },
    ...(sourceAssetId ? { sourceAssetId } : {}),
  };
  const updated = await db.pixelAction.updateMany({
    where: {
      id: action.id,
      status: { in: ["DRAFT", "PREPARED"] },
      workflow: { cancelledAt: null },
    },
    data: {
      status: "PREPARED",
      quote: quote as unknown as Prisma.InputJsonValue,
    },
  });
  if (!updated.count)
    throw new GenerationError("Action changed. Refresh before approval.", 409);
  return {
    quoteId: quote.quoteId,
    expiresAt: quote.expiresAt,
    maximumChargeCredits: quote.maximumChargeCredits,
    estimatedCredits: quote.estimatedCredits,
    modelName: quote.modelName,
    sourceAssetId: quote.sourceAssetId,
  };
}

export async function executePixelAction(
  ctx: AssistantToolContext,
  actionId: string,
  quoteId: string,
) {
  const action = await actionFor(ctx, actionId);
  if (action.jobId) return { jobId: action.jobId, replayed: true };
  const saved = action.quote as SavedQuote | null;
  if (!saved || saved.quoteId !== quoteId)
    throw new GenerationError(
      "The action quote changed. Review the new quote.",
      409,
    );
  // Serialize approval against quote replacement and workflow cancellation.
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM PixelWorkflow WHERE id = ${action.workflowId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM PixelAction WHERE id = ${action.id} FOR UPDATE`;
    const workflow = await tx.pixelWorkflow.findUnique({
      where: { id: action.workflowId },
    });
    const current = await tx.pixelAction.findUnique({
      where: { id: action.id },
    });
    const quote = current?.quote as SavedQuote | null;
    if (!quote || quote.quoteId !== quoteId)
      throw new GenerationError("This plan changed or was cancelled.", 409);
    if (current?.status === "ADMITTING" || current?.jobId) return;
    if (workflow?.cancelledAt)
      throw new GenerationError("This plan changed or was cancelled.", 409);
    if (
      current?.status !== "PREPARED" ||
      Date.parse(quote.expiresAt) <= Date.now()
    )
      throw new GenerationError(
        "Quote expired. Refresh it before approval.",
        409,
      );
    await tx.pixelAction.update({
      where: { id: action.id },
      data: { status: "ADMITTING", approvedAt: new Date() },
    });
    await tx.auditEvent.create({
      data: {
        actorUserId: ctx.userId,
        organizationId: ctx.organizationId,
        action: "pixel.action.approved",
        targetType: "PixelAction",
        targetId: action.id,
        metadata: { quoteId, maximumChargeCredits: quote.maximumChargeCredits },
      },
    });
  });
  // Never reset an uncertain admission. A replay uses the same persisted quote
  // and canonical key; generation services recover an existing reservation.
  const step = pixelStepSchema.parse(action.payload);
  let job: { id: string; status: string };
  try {
    job =
      step.kind === "IMAGE"
        ? await createImageJob(ctx.userId, saved.request)
        : step.kind === "VIDEO"
          ? await createVideoJob(ctx.userId, saved.request)
          : await createVoiceJob(ctx.userId, saved.request);
  } catch (error) {
    // Only definitive admission rejection permits a new quote. Timeouts and
    // infrastructure failures keep the original approval/key for recovery.
    if (
      error instanceof z.ZodError ||
      error instanceof InsufficientCreditsError ||
      error instanceof AssetQuotaExceededError ||
      error instanceof RangeError ||
      (error instanceof GenerationError && error.status < 500)
    ) {
      const key = createHash("sha256")
        .update(`${ctx.organizationId}:${ctx.userId}:${actionKey(action.id)}`)
        .digest("hex");
      const existing = await db.generationJob.findFirst({
        where: {
          idempotencyKey: key,
          organizationId: ctx.organizationId,
          createdById: ctx.userId,
        },
        select: { id: true },
      });
      if (!existing)
        await db.pixelAction.updateMany({
          where: { id: action.id, status: "ADMITTING", jobId: null },
          data: { status: "DRAFT", quote: Prisma.DbNull, approvedAt: null },
        });
    }
    if (error instanceof InsufficientCreditsError)
      throw new GenerationError(
        "Available credits changed. Top up and review a fresh quote.",
        409,
      );
    if (error instanceof AssetQuotaExceededError)
      throw new GenerationError(
        "Storage quota is full. Free space before reviewing a fresh quote.",
        409,
      );
    throw error;
  }
  await db.$transaction(async (tx) => {
    const linked = await tx.pixelAction.updateMany({
      where: { id: action.id, jobId: null },
      data: { jobId: job.id, status: "SUBMITTED" },
    });
    if (!linked.count) return;
    await tx.auditEvent.create({
      data: {
        actorUserId: ctx.userId,
        organizationId: ctx.organizationId,
        action: "pixel.action.submitted",
        targetType: "PixelAction",
        targetId: action.id,
        metadata: { jobId: job.id },
      },
    });
  });
  return { jobId: job.id, status: job.status };
}

export async function cancelPixelWorkflow(
  ctx: AssistantToolContext,
  workflowId: string,
) {
  await requirePixelAccess(ctx, "generation:create");
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM PixelWorkflow WHERE id = ${workflowId} FOR UPDATE`;
    const workflow = await tx.pixelWorkflow.findFirst({
      where: { id: workflowId, threadId: ctx.threadId },
    });
    if (!workflow) throw new GenerationError("Workflow not found.", 404);
    await tx.pixelWorkflow.update({
      where: { id: workflowId },
      data: { cancelledAt: new Date() },
    });
    await tx.auditEvent.create({
      data: {
        actorUserId: ctx.userId,
        organizationId: ctx.organizationId,
        action: "pixel.workflow.cancelled",
        targetType: "PixelWorkflow",
        targetId: workflowId,
      },
    });
  });
  return {
    cancelled: true,
    message:
      "Future steps stopped. Already approved jobs continue and remain accessible in History.",
  };
}
