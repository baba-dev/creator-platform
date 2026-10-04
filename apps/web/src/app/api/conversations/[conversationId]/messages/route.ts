import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
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

  if (!thread || thread.createdById !== session.user.id) {
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
      const userMessage = await db.chatMessage.create({
        data: {
          threadId: conversationId,
          clientRequestId: input.idempotencyKey,
          role: "user",
          content: input.content,
        },
      });

      const assistantMessage = await db.chatMessage.create({
        data: {
          threadId: conversationId,
          clientRequestId: `${input.idempotencyKey}-clarify`,
          role: "assistant",
          content: firstAction.question,
          metadata: {
            turnStatus: "REQUIRES_CLARIFICATION",
            clarification: {
              question: firstAction.question,
              options: firstAction.options,
            },
          },
        },
      });

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

      const userMessage = await db.chatMessage.create({
        data: {
          threadId: conversationId,
          clientRequestId: input.idempotencyKey,
          role: "user",
          content: input.content,
        },
      });

      const assistantMessage = await db.chatMessage.create({
        data: {
          threadId: conversationId,
          clientRequestId: `${input.idempotencyKey}-ack`,
          role: "assistant",
          content: `✓ ${label}. Ready for your next creative direction.`,
          metadata: {
            turnStatus: "COMPLETED",
            selectedAssetId,
          },
        },
      });

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

    // Apply action patches
    for (const action of plan.actions) {
      if (action.type === "select_asset") {
        const target = action.target;
        if (target.kind === "output_index") {
          const item = plannerContext.activeOutputGroup.find(
            (o) => o.index === target.index,
          );
          if (item) {
            firstFrameAssetId = item.assetId;
            currentState.activeAssetId = item.assetId;
          }
        } else if (target.kind === "asset_id") {
          firstFrameAssetId = target.assetId;
          currentState.activeAssetId = target.assetId;
        }
      } else if (action.type === "change_aspect_ratio") {
        targetRatio = action.aspectRatio;
      } else if (action.type === "change_resolution") {
        targetResolution = action.resolution;
      } else if (action.type === "create_variations") {
        targetOutputCount = action.outputCount ?? 4;
        if (action.prompt) targetPrompt = action.prompt;
      } else if (action.type === "switch_model") {
        const altModel = await findCompatibleAlternativeModel({
          modality: action.targetMediaKind ?? targetModality,
          currentModelId: targetModelId,
          requiredAspectRatio: targetRatio,
          requiredResolution: targetResolution,
        });
        if (altModel) {
          targetModelId = altModel.modelId;
        }
      } else if (action.type === "generate_video") {
        targetModality = "VIDEO";
        if (action.prompt) targetPrompt = action.prompt;
        if (action.firstFrameAssetId) {
          firstFrameAssetId = action.firstFrameAssetId;
        } else if (!firstFrameAssetId && currentState.activeAssetId) {
          firstFrameAssetId = currentState.activeAssetId;
        }
        if (action.durationSeconds) targetDuration = action.durationSeconds;
      } else if (action.type === "use_first_frame") {
        if (action.assetId) {
          firstFrameAssetId = action.assetId;
        } else if (currentState.activeAssetId) {
          firstFrameAssetId = currentState.activeAssetId;
        }
      } else if (action.type === "generate_speech") {
        targetModality = "VOICE";
        if (action.text) targetPrompt = action.text;
        if (action.voiceKey) targetVoiceKey = action.voiceKey;
        if (action.speechRate) targetSpeechRate = action.speechRate;
      } else if (action.type === "change_voice") {
        targetVoiceKey = action.voiceKey;
      } else if (action.type === "change_speaking_rate") {
        targetSpeechRate = action.speechRate;
      } else if (action.type === "generate_image") {
        targetModality = "IMAGE";
        if (action.prompt) targetPrompt = action.prompt;
        if (action.aspectRatio) targetRatio = action.aspectRatio;
        if (action.resolution) targetResolution = action.resolution;
        if (action.outputCount) targetOutputCount = action.outputCount;
      }
    }

    // Resolve target model and price version
    const now = new Date();
    const model = await db.providerModel.findFirst({
      where: {
        OR: [{ id: targetModelId }, { providerModelId: targetModelId }],
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
    const userMessage = await db.chatMessage.create({
      data: {
        threadId: conversationId,
        clientRequestId: input.idempotencyKey,
        role: "user",
        content: input.content,
      },
    });

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
      job = await createVideoJob(session.user.id, {
        organizationId: thread.organizationId,
        projectId: thread.projectId,
        modelId: model.id,
        priceVersionId: priceVersion.id,
        idempotencyKey: input.idempotencyKey,
        prompt: targetPrompt,
        durationSeconds: targetDuration,
        outputFormat: "mp4",
        schemaVersion: 2,
        workflow: firstFrameAssetId ? "FRAME_TO_VIDEO" : "GENERATE",
        sources: firstFrameAssetId
          ? [{ assetId: firstFrameAssetId, role: "FIRST_FRAME" }]
          : [],
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
      });
    }

    // Set provenance: link parent generation job and conversation thread
    await db.generationJob.update({
      where: { id: job.id },
      data: {
        parentGenerationId: latestJob?.id ?? null,
        chatThreadId: conversationId,
      },
    });

    // Update conversation working state
    currentState.activeGenerationId = job.id;
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

    const assistantMessage = await db.chatMessage.create({
      data: {
        threadId: conversationId,
        clientRequestId: `${input.idempotencyKey}-assistant`,
        role: "assistant",
        content: `Generating ${targetModality.toLowerCase()} with ${model.displayName}...`,
        metadata: {
          turnStatus: "EXECUTING",
          generationJobId: job.id,
          parentGenerationId: latestJob?.id ?? null,
          effectiveSpec: {
            modality: targetModality,
            modelId: model.id,
            prompt: targetPrompt,
            aspectRatio: targetRatio,
            resolution: targetResolution,
            outputCount: targetOutputCount,
          },
        },
      },
    });

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
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
