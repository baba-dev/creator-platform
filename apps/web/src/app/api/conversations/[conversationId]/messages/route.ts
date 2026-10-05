import { hasOrganizationPermission } from "@aiwa/authz";
import { db, type Prisma } from "@aiwa/db";
import {
  createImageJob,
  createVideoJob,
  createVoiceJob,
  GenerationError,
} from "@aiwa/generation";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import { buildPlannerContext } from "../../../../../lib/conversations/context-builder";
import { planConversationTurn } from "../../../../../lib/conversations/planner";
import { findCompatibleAlternativeModel } from "../../../../../lib/conversations/capability-router";
import type {
  ConversationState,
  CreativeModality,
} from "../../../../../lib/conversations/types";

const messageInputSchema = z.object({
  content: z.string().trim().min(1, "Message cannot be empty.").max(4000),
  selectedAssetId: z.string().min(1).max(100).optional(),
  idempotencyKey: z.string().uuid(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  if (!hasTrustedMutationOrigin(request)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }

  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const { conversationId } = await params;
  const thread = await db.chatThread.findUnique({
    where: { id: conversationId },
    include: {
      generationJobs: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          assets: {
            where: { status: "READY", deletedAt: null },
            orderBy: { generationOutputIndex: "asc" },
            select: {
              id: true,
              mimeType: true,
              generationOutputIndex: true,
              width: true,
              height: true,
              durationMs: true,
            },
          },
          providerModel: {
            select: {
              id: true,
              provider: true,
              displayName: true,
              mediaKind: true,
            },
          },
        },
      },
    },
  });

  if (
    !thread ||
    thread.threadType !== "CREATIVE" ||
    thread.createdById !== session.user.id
  ) {
    return NextResponse.json(
      { error: "Conversation not found." },
      { status: 404 },
    );
  }

  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: thread.organizationId,
        userId: session.user.id,
      },
    },
    include: { organization: true },
  });
  if (
    !membership ||
    membership.organization.status !== "ACTIVE" ||
    !hasOrganizationPermission(membership.role, "generation:create")
  ) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  try {
    const json = await request.json();
    const input = messageInputSchema.parse(json);

    const upsertMessage = (
      role: "user" | "assistant",
      clientRequestId: string,
      content: string,
      metadata?: Prisma.InputJsonValue,
    ) =>
      db.chatMessage.upsert({
        where: {
          threadId_clientRequestId_role: {
            threadId: conversationId,
            clientRequestId,
            role,
          },
        },
        update: {
          content,
          ...(metadata ? { metadata } : {}),
        },
        create: {
          threadId: conversationId,
          clientRequestId,
          role,
          content,
          ...(metadata ? { metadata } : {}),
        },
      });

    const latestJob = thread.generationJobs[0] ?? null;
    const currentState = (thread.state as unknown as ConversationState) ?? {
      activeModality: "IMAGE",
      settings: {},
      activeOutputs: [],
    };

    // Load recent messages for context
    const recentMessages = await db.chatMessage.findMany({
      where: { threadId: conversationId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { role: true, content: true },
    });

    // Build planner context
    const plannerContext = buildPlannerContext({
      conversationId,
      title: thread.title,
      state: currentState,
      latestJob,
      recentMessages: recentMessages.reverse(),
      clientSelectedAssetId: input.selectedAssetId ?? null,
    });

    // Plan conversational turn
    const plan = await planConversationTurn({
      userMessage: input.content,
      organizationId: thread.organizationId,
      context: plannerContext,
      explicitAssetId: input.selectedAssetId ?? null,
    });

    const firstAction = plan.actions[0]!;

    // =========================================================
    // Case 1: Clarification needed (Ambiguity)
    // =========================================================
    if (firstAction.type === "clarify") {
      const userMessage = await upsertMessage(
        "user",
        input.idempotencyKey,
        input.content,
      );

      const assistantMessage = await upsertMessage(
        "assistant",
        `${input.idempotencyKey}-clarify`,
        firstAction.question,
        {
          turnStatus: "REQUIRES_CLARIFICATION",
          clarification: {
            question: firstAction.question,
            options: firstAction.options,
          },
        },
      );

      return NextResponse.json(
        {
          userMessage,
          assistantMessage,
          clarification: {
            question: firstAction.question,
            options: firstAction.options,
          },
          status: 200,
        },
        { status: 200 },
      );
    }

    // =========================================================
    // Case 2: State-Only Selection (Zero credits)
    // =========================================================
    if (firstAction.type === "select_asset" && plan.actions.length === 1) {
      let selectedAssetId: string | undefined;
      let label = "Asset selected";

      const target = firstAction.target;
      if (target.kind === "output_index") {
        const item = plannerContext.activeOutputGroup.find(
          (o) => o.index === target.index,
        );
        if (item) {
          selectedAssetId = item.assetId;
          label = `Image #${item.index} selected`;
        }
      } else if (target.kind === "asset_id") {
        selectedAssetId = target.assetId;
        label = "Asset selected";
      }

      if (selectedAssetId) {
        currentState.activeAssetId = selectedAssetId;
        await db.chatThread.update({
          where: { id: conversationId },
          data: {
            state: currentState as unknown as object,
            updatedAt: new Date(),
          },
        });
      }

      const userMessage = await upsertMessage(
        "user",
        input.idempotencyKey,
        input.content,
      );

      const assistantMessage = await upsertMessage(
        "assistant",
        `${input.idempotencyKey}-ack`,
        `✓ ${label}. Ready for your next creative direction.`,
        {
          turnStatus: "COMPLETED",
          selectedAssetId,
        },
      );

      return NextResponse.json(
        {
          userMessage,
          assistantMessage,
          selectedAssetId,
          status: 200,
        },
        { status: 200 },
      );
    }

    // =========================================================
    // Case 3: Media Generation Action
    // =========================================================
    // Extract base effective generation spec from latest job
    const basePayload =
      (latestJob?.requestPayload as Record<string, unknown>) ?? {};
    let targetModality: CreativeModality = plannerContext.activeModality;
    let targetModelId = plannerContext.currentModelId || thread.modelId;
    let targetPrompt =
      (basePayload.prompt as string) ||
      (basePayload.text as string) ||
      input.content;

    let targetRatio =
      (basePayload.aspectRatio as string) ||
      plannerContext.currentSettings.aspectRatio ||
      "1:1";
    let targetResolution =
      (basePayload.resolution as string) ||
      plannerContext.currentSettings.resolution ||
      "2K";
    let targetOutputCount =
      (basePayload.outputCount as number) ||
      plannerContext.currentSettings.outputCount ||
      1;
    let targetDuration =
      (basePayload.durationSeconds as number) ||
      plannerContext.currentSettings.durationSeconds ||
      5;
    let targetVoiceKey =
      (basePayload.voiceKey as string) ||
      plannerContext.currentSettings.voiceKey ||
      "jasper";
    let targetSpeechRate =
      (basePayload.speechRate as number) ||
      plannerContext.currentSettings.speechRate ||
      1.0;
    let firstFrameAssetId: string | undefined;
    let imageReferenceAssetIds: string[] = [];
    let videoSourceAssetId: string | undefined;
    let videoWorkflow: "GENERATE" | "FRAME_TO_VIDEO" | "EXTEND" = "GENERATE";
    let extensionDirection: "BEFORE" | "AFTER" | undefined;
    let requestedModelSwitch = false;
    let needsCapabilityRouting = false;

    // Apply action patches
    for (const action of plan.actions) {
      if (action.type === "select_asset") {
        const target = action.target;
        if (target.kind === "output_index") {
          const item = plannerContext.activeOutputGroup.find(
            (o) => o.index === target.index,
          );
          if (item) {
            currentState.activeAssetId = item.assetId;
            firstFrameAssetId = item.assetId;
          }
        } else if (target.kind === "asset_id") {
          currentState.activeAssetId = target.assetId;
          firstFrameAssetId = target.assetId;
        }
      } else if (action.type === "change_aspect_ratio") {
        targetRatio = action.aspectRatio;
      } else if (action.type === "change_resolution") {
        targetResolution = action.resolution;
      } else if (action.type === "create_variations") {
        targetModality = "IMAGE";
        targetOutputCount = action.outputCount ?? 4;
        if (action.prompt) targetPrompt = action.prompt;
        const sourceAssetId =
          action.sourceAssetId ??
          currentState.activeAssetId ??
          plannerContext.selectedAssetId ??
          undefined;
        imageReferenceAssetIds = sourceAssetId ? [sourceAssetId] : [];
        needsCapabilityRouting = true;
      } else if (action.type === "edit_image") {
        targetModality = "IMAGE";
        if (action.prompt) targetPrompt = action.prompt;
        if (action.aspectRatio) targetRatio = action.aspectRatio;
        const sourceAssetId =
          action.sourceAssetId ??
          currentState.activeAssetId ??
          plannerContext.selectedAssetId ??
          undefined;
        imageReferenceAssetIds = sourceAssetId ? [sourceAssetId] : [];
        needsCapabilityRouting = true;
      } else if (action.type === "switch_model") {
        targetModality = action.targetMediaKind ?? targetModality;
        requestedModelSwitch = true;
        needsCapabilityRouting = true;
      } else if (action.type === "generate_video") {
        targetModality = "VIDEO";
        if (action.prompt) targetPrompt = action.prompt;
        if (action.firstFrameAssetId) {
          firstFrameAssetId = action.firstFrameAssetId;
        } else if (!firstFrameAssetId && currentState.activeAssetId) {
          firstFrameAssetId = currentState.activeAssetId;
        }
        if (action.durationSeconds) targetDuration = action.durationSeconds;
        videoWorkflow =
          action.workflow === "EXTEND"
            ? "EXTEND"
            : firstFrameAssetId
              ? "FRAME_TO_VIDEO"
              : "GENERATE";
        if (videoWorkflow === "EXTEND") {
          videoSourceAssetId = firstFrameAssetId;
          firstFrameAssetId = undefined;
        }
        needsCapabilityRouting =
          needsCapabilityRouting || plannerContext.activeModality !== "VIDEO";
      } else if (action.type === "extend_video") {
        targetModality = "VIDEO";
        videoWorkflow = "EXTEND";
        videoSourceAssetId =
          action.sourceAssetId ??
          currentState.activeAssetId ??
          plannerContext.selectedAssetId ??
          undefined;
        targetDuration = action.durationSeconds ?? 5;
        extensionDirection = action.direction ?? "AFTER";
        needsCapabilityRouting = true;
      } else if (action.type === "use_first_frame") {
        targetModality = "VIDEO";
        if (action.assetId) {
          firstFrameAssetId = action.assetId;
        } else if (currentState.activeAssetId) {
          firstFrameAssetId = currentState.activeAssetId;
        }
        videoWorkflow = "FRAME_TO_VIDEO";
        needsCapabilityRouting = true;
      } else if (action.type === "generate_speech") {
        targetModality = "VOICE";
        if (action.text) targetPrompt = action.text;
        if (action.voiceKey) targetVoiceKey = action.voiceKey;
        if (action.speechRate) targetSpeechRate = action.speechRate;
        needsCapabilityRouting =
          needsCapabilityRouting || plannerContext.activeModality !== "VOICE";
      } else if (action.type === "change_voice") {
        targetVoiceKey = action.voiceKey;
      } else if (action.type === "change_speaking_rate") {
        targetSpeechRate = action.speechRate;
      } else if (action.type === "retry_generation") {
        if (!latestJob) {
          throw new GenerationError("There is no generation to retry.", 409);
        }

        if (targetModality === "IMAGE") {
          const references = Array.isArray(basePayload.referenceAssetIds)
            ? basePayload.referenceAssetIds.filter(
                (assetId): assetId is string => typeof assetId === "string",
              )
            : [];
          imageReferenceAssetIds = references;
        } else if (targetModality === "VIDEO") {
          if (basePayload.schemaVersion !== 2) {
            throw new GenerationError(
              "This older video turn cannot be retried safely from conversation history.",
              409,
            );
          }

          const priorWorkflow = basePayload.workflow;
          if (
            priorWorkflow !== "GENERATE" &&
            priorWorkflow !== "FRAME_TO_VIDEO" &&
            priorWorkflow !== "EXTEND"
          ) {
            throw new GenerationError(
              "This video workflow cannot be retried from the conversational workspace yet.",
              409,
            );
          }

          videoWorkflow = priorWorkflow;
          const priorSources = Array.isArray(basePayload.sources)
            ? basePayload.sources.filter(
                (
                  source,
                ): source is {
                  assetId: string;
                  role: string;
                  position: number;
                } =>
                  Boolean(
                    source &&
                      typeof source === "object" &&
                      "assetId" in source &&
                      typeof source.assetId === "string" &&
                      "role" in source &&
                      typeof source.role === "string" &&
                      "position" in source &&
                      typeof source.position === "number",
                  ),
              )
            : [];

          if (videoWorkflow === "FRAME_TO_VIDEO") {
            firstFrameAssetId = priorSources.find(
              (source) => source.role === "FIRST_FRAME",
            )?.assetId;
            if (!firstFrameAssetId) {
              throw new GenerationError(
                "The original first-frame source is no longer available in this turn.",
                409,
              );
            }
          } else if (videoWorkflow === "EXTEND") {
            videoSourceAssetId = priorSources.find(
              (source) => source.role === "SOURCE_VIDEO",
            )?.assetId;
            if (!videoSourceAssetId) {
              throw new GenerationError(
                "The original source video is no longer available in this turn.",
                409,
              );
            }
            extensionDirection =
              basePayload.extensionDirection === "BEFORE" ? "BEFORE" : "AFTER";
          }
        }
      } else if (action.type === "generate_image") {
        targetModality = "IMAGE";
        if (action.prompt) targetPrompt = action.prompt;
        if (action.aspectRatio) targetRatio = action.aspectRatio;
        if (action.resolution) targetResolution = action.resolution;
        if (action.outputCount) targetOutputCount = action.outputCount;
        if (action.referenceAssetIds?.length) {
          imageReferenceAssetIds = action.referenceAssetIds;
          needsCapabilityRouting = true;
        }
      }
    }

    if (targetModality === "VIDEO") {
      if (!["480p", "720p", "1080p", "4K"].includes(targetResolution)) {
        targetResolution = "720p";
      }
      if (videoWorkflow === "FRAME_TO_VIDEO" || videoWorkflow === "EXTEND") {
        targetRatio = "adaptive";
      } else if (
        !["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"].includes(
          targetRatio,
        )
      ) {
        targetRatio = "16:9";
      }
      targetOutputCount = 1;
    } else if (targetModality === "IMAGE") {
      if (!["1K", "1.5K", "2K", "3K", "4K"].includes(targetResolution)) {
        targetResolution = "2K";
      }
      if (
        !["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"].includes(
          targetRatio,
        )
      ) {
        targetRatio = "1:1";
      }
    }

    if (targetModality !== plannerContext.activeModality) {
      needsCapabilityRouting = true;
    }

    // Resolve target model and price version
    if (needsCapabilityRouting) {
      const routed = await findCompatibleAlternativeModel({
        modality: targetModality,
        currentModelId: targetModelId,
        requiredAspectRatio:
          targetModality === "VOICE" ? undefined : targetRatio,
        requiredResolution:
          targetModality === "VOICE" ? undefined : targetResolution,
        requireReferenceImages:
          targetModality === "IMAGE" && imageReferenceAssetIds.length > 0,
        requiredOutputCount:
          targetModality === "IMAGE" ? targetOutputCount : undefined,
        requireExtendVideo:
          targetModality === "VIDEO" && videoWorkflow === "EXTEND",
        excludeCurrentModel: requestedModelSwitch,
      });
      if (!routed) {
        throw new GenerationError(
          "No enabled model can satisfy this creative action with the current settings.",
          409,
        );
      }
      targetModelId = routed.modelId;
    }

    const now = new Date();
    const model = await db.providerModel.findFirst({
      where: {
        OR: [{ id: targetModelId }, { providerModelId: targetModelId }],
        provider: "BYTEPLUS",
        mediaKind: targetModality,
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

    if (!model || !model.priceVersions[0]) {
      throw new GenerationError(
        "Compatible creative model is unavailable.",
        409,
      );
    }

    const priceVersion = model.priceVersions[0];

    // Create user message
    const userMessage = await upsertMessage(
      "user",
      input.idempotencyKey,
      input.content,
    );

    // Execute generation job with parent derivation tracking
    let job: { id: string; status: string };
    if (targetModality === "VOICE") {
      job = await createVoiceJob(session.user.id, {
        organizationId: thread.organizationId,
        projectId: thread.projectId,
        modelId: model.id,
        priceVersionId: priceVersion.id,
        idempotencyKey: input.idempotencyKey,
        text: targetPrompt,
        voiceKey: targetVoiceKey,
        speechRate: targetSpeechRate,
        format: "mp3",
      });
    } else if (targetModality === "VIDEO") {
      const sources =
        videoWorkflow === "EXTEND" && videoSourceAssetId
          ? [
              {
                assetId: videoSourceAssetId,
                role: "SOURCE_VIDEO" as const,
                position: 0,
              },
            ]
          : firstFrameAssetId
            ? [
                {
                  assetId: firstFrameAssetId,
                  role: "FIRST_FRAME" as const,
                  position: 0,
                },
              ]
            : [];
      job = await createVideoJob(session.user.id, {
        organizationId: thread.organizationId,
        projectId: thread.projectId,
        modelId: model.id,
        priceVersionId: priceVersion.id,
        idempotencyKey: input.idempotencyKey,
        prompt: targetPrompt,
        durationSeconds: targetDuration,
        aspectRatio: targetRatio,
        resolution: targetResolution,
        generateAudio: false,
        outputFormat: "mp4",
        returnLastFrame: true,
        schemaVersion: 2,
        workflow: videoWorkflow,
        sources,
        ...(videoWorkflow === "EXTEND" && extensionDirection
          ? { extensionDirection }
          : {}),
      });
    } else {
      job = await createImageJob(session.user.id, {
        organizationId: thread.organizationId,
        projectId: thread.projectId,
        modelId: model.id,
        priceVersionId: priceVersion.id,
        idempotencyKey: input.idempotencyKey,
        prompt: targetPrompt,
        aspectRatio: targetRatio,
        resolution: targetResolution,
        outputCount: targetOutputCount,
        referenceAssetIds: imageReferenceAssetIds,
      });
    }

    // Set provenance exactly once. Replaying an idempotent turn must never
    // rewrite lineage (especially not into a self-parent cycle), and a key
    // already claimed by another conversation must not move the job.
    const durableJob = await db.generationJob.findUnique({
      where: { id: job.id },
      select: { chatThreadId: true, parentGenerationId: true },
    });
    if (
      durableJob?.chatThreadId &&
      durableJob.chatThreadId !== conversationId
    ) {
      throw new GenerationError(
        "This idempotency key is already linked to another conversation.",
        409,
      );
    }

    const parentGenerationId =
      durableJob?.chatThreadId === conversationId
        ? durableJob.parentGenerationId
        : latestJob?.id === job.id
          ? null
          : (latestJob?.id ?? null);

    if (!durableJob?.chatThreadId) {
      const claim = await db.generationJob.updateMany({
        where: { id: job.id, chatThreadId: null },
        data: {
          parentGenerationId,
          chatThreadId: conversationId,
        },
      });
      if (claim.count === 0) {
        const winner = await db.generationJob.findUnique({
          where: { id: job.id },
          select: { chatThreadId: true },
        });
        if (winner?.chatThreadId !== conversationId) {
          throw new GenerationError(
            "Generation job provenance could not be claimed safely.",
            409,
          );
        }
      }
    }

    // Update conversation working state
    currentState.activeGenerationId = job.id;
    currentState.activeAssetId = null;
    currentState.activeOutputs = [];
    currentState.activeModality = targetModality;
    currentState.currentModelId = model.id;
    currentState.currentProvider = model.provider;
    currentState.settings = {
      aspectRatio: targetRatio,
      resolution: targetResolution,
      outputCount: targetOutputCount,
      durationSeconds: targetDuration,
      voiceKey: targetVoiceKey,
      speechRate: targetSpeechRate,
    };

    await db.chatThread.update({
      where: { id: conversationId },
      data: {
        state: currentState as unknown as object,
        updatedAt: new Date(),
      },
    });

    const assistantMessage = await upsertMessage(
      "assistant",
      `${input.idempotencyKey}-assistant`,
      `Generating ${targetModality.toLowerCase()} with ${model.displayName}...`,
      {
        turnStatus: "EXECUTING",
        generationJobId: job.id,
        parentGenerationId,
        effectiveSpec: {
          modality: targetModality,
          modelId: model.id,
          prompt: targetPrompt,
          aspectRatio: targetRatio,
          resolution: targetResolution,
          outputCount: targetOutputCount,
          referenceAssetIds: imageReferenceAssetIds,
          videoWorkflow: targetModality === "VIDEO" ? videoWorkflow : undefined,
        },
      },
    );

    return NextResponse.json(
      {
        userMessage,
        assistantMessage,
        jobId: job.id,
        status: job.status,
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid message data.", issues: error.issues },
        { status: 400 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Message turn execution failed.";
    const status = error instanceof GenerationError ? error.status : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
