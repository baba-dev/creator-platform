import { createHash } from "node:crypto";

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

import { rateLimit } from "@/lib/rate-limit";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import {
  buildPlannerContext,
  type ContextBuilderJobSummary,
} from "../../../../../lib/conversations/context-builder";
import { planConversationTurn } from "../../../../../lib/conversations/planner";
import { answerCreativeQuestion } from "../../../../../lib/conversations/read-only-response";
import { findCompatibleAlternativeModel } from "../../../../../lib/conversations/capability-router";
import type {
  ConversationState,
  CreativeModality,
} from "../../../../../lib/conversations/types";

const generationLimiter = rateLimit({
  max: 10,
  windowMs: 60_000,
  prefix: "generation",
});
const CONVERSATION_TURN_LEASE_MS = 60_000;

const messageInputSchema = z
  .object({
    content: z.string().trim().min(1, "Message cannot be empty.").max(4000),
    selectedAssetId: z.string().min(1).max(100).optional(),
    sourceGenerationId: z.string().min(1).max(100).optional(),
    expectedRevision: z.number().int().nonnegative().optional(),
    mode: z.enum(["plan", "execute"]).default("execute"),
    resumePendingOperation: z.boolean().optional().default(false),
    idempotencyKey: z.string().uuid(),
    planFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  })
  .superRefine((value, context) => {
    if (value.mode === "execute" && value.expectedRevision === undefined) {
      context.addIssue({
        code: "custom",
        path: ["expectedRevision"],
        message: "Conversation revision is required for execution.",
      });
    }
  });

async function releaseConversationTurnLease(
  conversationId: string,
  idempotencyKey: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM ChatThread WHERE id = ${conversationId} FOR UPDATE`;
    const row = await tx.chatThread.findUnique({
      where: { id: conversationId },
      select: { state: true },
    });
    const state = row?.state as unknown as ConversationState | null;
    if (!state || state.inFlightTurn?.idempotencyKey !== idempotencyKey) return;

    const nextState = structuredClone(state);
    nextState.inFlightTurn = null;
    nextState.revision = Number(state.revision ?? 0) + 1;
    await tx.chatThread.update({
      where: { id: conversationId },
      data: {
        state: nextState as unknown as object,
        updatedAt: new Date(),
      },
    });
  });
}

async function mutateConversationState(
  conversationId: string,
  fallbackState: ConversationState,
  mutate: (state: ConversationState) => void,
  expectedRevision?: number,
): Promise<ConversationState> {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM ChatThread WHERE id = ${conversationId} FOR UPDATE`;
      const row = await tx.chatThread.findUnique({
        where: { id: conversationId },
        select: { state: true },
      });
      const sourceState =
        (row?.state as unknown as ConversationState | null) ?? fallbackState;
      const currentRevision = Number(sourceState.revision ?? 0);
      if (
        expectedRevision !== undefined &&
        currentRevision !== expectedRevision
      ) {
        throw new GenerationError(
          "Conversation state was modified in another request. Please reload to see the latest changes.",
          409,
        );
      }
      const nextState = structuredClone(sourceState);
      mutate(nextState);
      nextState.revision = currentRevision + 1;

      await tx.chatThread.update({
        where: { id: conversationId },
        data: {
          state: nextState as unknown as object,
          updatedAt: new Date(),
        },
      });

      return nextState;
    },
    { isolationLevel: "ReadCommitted", timeout: 5000 },
  );
}

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

  let conversationRevisionClaimed = false;
  let claimedTurnId: string | null = null;
  try {
    const json = await request.json();
    const input = messageInputSchema.parse(json);
    const requestFingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          content: input.content,
          selectedAssetId: input.selectedAssetId ?? null,
          sourceGenerationId: input.sourceGenerationId ?? null,
          resumePendingOperation: input.resumePendingOperation,
        }),
      )
      .digest("hex");

    const existingUserMessage = await db.chatMessage.findUnique({
      where: {
        threadId_clientRequestId_role: {
          threadId: conversationId,
          clientRequestId: input.idempotencyKey,
          role: "user",
        },
      },
    });
    if (existingUserMessage) {
      const existingMetadata =
        existingUserMessage.metadata &&
        typeof existingUserMessage.metadata === "object" &&
        !Array.isArray(existingUserMessage.metadata)
          ? (existingUserMessage.metadata as Record<string, unknown>)
          : null;
      const existingFingerprint =
        typeof existingMetadata?.transportFingerprint === "string"
          ? existingMetadata.transportFingerprint
          : null;
      if (
        existingUserMessage.content !== input.content ||
        (existingFingerprint && existingFingerprint !== requestFingerprint)
      ) {
        return NextResponse.json(
          { error: "Request key was already used for a different turn." },
          { status: 409 },
        );
      }
    }

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
        update: {},
        create: {
          threadId: conversationId,
          clientRequestId,
          role,
          content,
          ...(metadata ? { metadata } : {}),
        },
      });

    const upsertUserMessage = () =>
      upsertMessage("user", input.idempotencyKey, input.content, {
        transportFingerprint: requestFingerprint,
      });

    const latestJob = thread.generationJobs[0] ?? null;
    const currentState = (thread.state as unknown as ConversationState) ?? {
      activeModality: "IMAGE",
      settings: {},
      activeOutputs: [],
    };

    // Recover an already-accepted billable turn before replanning against newer
    // conversation state. This keeps transport retries stable even if the first
    // HTTP response was lost after the generation job was committed.
    const generationTransportKey = createHash("sha256")
      .update(
        `${thread.organizationId}:${session.user.id}:${input.idempotencyKey}`,
      )
      .digest("hex");
    const replayJob = await db.generationJob.findFirst({
      where: { idempotencyKey: generationTransportKey },
      include: {
        providerModel: {
          select: {
            id: true,
            provider: true,
            displayName: true,
            mediaKind: true,
          },
        },
      },
    });

    if (replayJob) {
      if (replayJob.chatThreadId && replayJob.chatThreadId !== conversationId) {
        return NextResponse.json(
          { error: "Request key is already linked to another conversation." },
          { status: 409 },
        );
      }

      const parentGenerationId =
        replayJob.parentGenerationId ??
        (latestJob?.id && latestJob.id !== replayJob.id ? latestJob.id : null);

      if (!replayJob.chatThreadId) {
        const claim = await db.generationJob.updateMany({
          where: { id: replayJob.id, chatThreadId: null },
          data: {
            chatThreadId: conversationId,
            parentGenerationId,
          },
        });
        if (claim.count === 0) {
          const winner = await db.generationJob.findUnique({
            where: { id: replayJob.id },
            select: { chatThreadId: true },
          });
          if (winner?.chatThreadId !== conversationId) {
            return NextResponse.json(
              { error: "Generation replay could not be linked safely." },
              { status: 409 },
            );
          }
        }
      }

      const userMessage = await upsertUserMessage();
      const assistantMessage = await upsertMessage(
        "assistant",
        `${input.idempotencyKey}-assistant`,
        `Generating ${replayJob.providerModel.mediaKind.toLowerCase()} with ${replayJob.providerModel.displayName}...`,
        {
          turnStatus: "EXECUTING",
          generationJobId: replayJob.id,
          parentGenerationId,
          effectiveSpec: replayJob.requestPayload as Prisma.InputJsonValue,
        },
      );

      const replayIsCurrent =
        !latestJob ||
        latestJob.id === replayJob.id ||
        replayJob.chatThreadId === null;
      if (
        replayIsCurrent &&
        currentState.activeGenerationId !== replayJob.id &&
        Number(currentState.revision ?? 0) === input.expectedRevision
      ) {
        const payload =
          replayJob.requestPayload &&
          typeof replayJob.requestPayload === "object" &&
          !Array.isArray(replayJob.requestPayload)
            ? (replayJob.requestPayload as Record<string, unknown>)
            : {};
        await mutateConversationState(conversationId, currentState, (state) => {
          state.activeGenerationId = replayJob.id;
          state.activeAssetId = null;
          state.activeOutputs = [];
          state.activeModality =
            replayJob.providerModel.mediaKind === "VIDEO"
              ? "VIDEO"
              : replayJob.providerModel.mediaKind === "VOICE"
                ? "VOICE"
                : "IMAGE";
          state.currentModelId = replayJob.providerModel.id;
          state.currentProvider = replayJob.providerModel.provider;
          state.settings = {
            ...state.settings,
            ...(typeof payload.aspectRatio === "string"
              ? { aspectRatio: payload.aspectRatio }
              : {}),
            ...(typeof payload.resolution === "string"
              ? { resolution: payload.resolution }
              : {}),
            ...(typeof payload.outputCount === "number"
              ? { outputCount: payload.outputCount }
              : {}),
            ...(typeof payload.durationSeconds === "number"
              ? { durationSeconds: payload.durationSeconds }
              : {}),
            ...(typeof payload.voiceKey === "string"
              ? { voiceKey: payload.voiceKey }
              : {}),
            ...(typeof payload.speechRate === "number"
              ? { speechRate: payload.speechRate }
              : {}),
          };
          state.pendingOperation = null;
        });
      }

      return NextResponse.json(
        {
          userMessage,
          assistantMessage,
          jobId: replayJob.id,
          status: replayJob.status,
          replayed: true,
        },
        { status: 202 },
      );
    }

    // Completed zero-credit and clarification turns are also replay-safe.
    if (existingUserMessage) {
      const priorAssistant = await db.chatMessage.findFirst({
        where: {
          threadId: conversationId,
          role: "assistant",
          clientRequestId: {
            in: [
              `${input.idempotencyKey}-ack`,
              `${input.idempotencyKey}-clarify`,
            ],
          },
        },
      });
      if (priorAssistant) {
        const metadata =
          priorAssistant.metadata &&
          typeof priorAssistant.metadata === "object" &&
          !Array.isArray(priorAssistant.metadata)
            ? (priorAssistant.metadata as Record<string, unknown>)
            : {};
        return NextResponse.json(
          {
            userMessage: existingUserMessage,
            assistantMessage: priorAssistant,
            ...(metadata.clarification
              ? { clarification: metadata.clarification }
              : {}),
            ...(typeof metadata.selectedAssetId === "string"
              ? { selectedAssetId: metadata.selectedAssetId }
              : {}),
            status: 200,
            replayed: true,
          },
          { status: 200 },
        );
      }
    }

    // Load recent messages for context
    const recentMessages = await db.chatMessage.findMany({
      where: { threadId: conversationId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { role: true, content: true },
    });

    // Resolve and authorize historical source job if client focused a specific step
    let sourceJob: ContextBuilderJobSummary | null = null;
    if (input.sourceGenerationId) {
      const foundSource = await db.generationJob.findFirst({
        where: {
          id: input.sourceGenerationId,
          chatThreadId: conversationId,
          organizationId: thread.organizationId,
        },
        select: {
          id: true,
          status: true,
          requestPayload: true,
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
      });
      if (!foundSource) {
        return NextResponse.json(
          { error: "Referenced source step not found in this conversation." },
          { status: 404 },
        );
      }
      sourceJob = foundSource;
    }

    // Build planner context
    const plannerContext = buildPlannerContext({
      conversationId,
      title: thread.title,
      state: currentState,
      latestJob,
      sourceJob,
      recentMessages: recentMessages.reverse(),
      clientSelectedAssetId: input.selectedAssetId ?? null,
    });

    let planPrompt = input.content;
    const explicitAssetToUse = input.selectedAssetId ?? null;
    let isResumedClarification = false;

    if (
      input.resumePendingOperation &&
      explicitAssetToUse &&
      currentState.pendingOperation?.originalPrompt
    ) {
      planPrompt = currentState.pendingOperation.originalPrompt;
      isResumedClarification = true;
    }

    // Plan conversational turn
    const plan = await planConversationTurn({
      userMessage: planPrompt,
      organizationId: thread.organizationId,
      context: plannerContext,
      explicitAssetId: explicitAssetToUse,
    });

    const firstAction = plan.actions[0]!;

    // =========================================================
    // Case 0: Explicit non-billable questions and creative consultation.
    if (firstAction.type === "answer_question") {
      if (input.mode === "plan") {
        return NextResponse.json({
          mode: "plan", billable: false, action: firstAction.type,
          expectedRevision: currentState.revision ?? 0,
        });
      }
      if (Number(currentState.revision ?? 0) !== input.expectedRevision) {
        return NextResponse.json({
          error: "Conversation state was modified. Refresh and try again.",
          code: "CONVERSATION_CONFLICT",
        }, { status: 409 });
      }
      const userMessage = await upsertUserMessage();
      const answer = answerCreativeQuestion(firstAction.question, plannerContext);
      const assistantMessage = await upsertMessage(
        "assistant",
        `${input.idempotencyKey}-answer`,
        answer,
        { turnStatus: "COMPLETED", actions: [] },
      );
      return NextResponse.json({
        userMessage, assistantMessage, status: 200,
        revision: currentState.revision ?? 0,
      });
    }

    // Case 1: Clarification needed (Ambiguity)
    // =========================================================
    if (firstAction.type === "clarify") {
      if (input.mode === "plan") {
        return NextResponse.json({
          mode: "plan", billable: false, action: firstAction.type,
          expectedRevision: currentState.revision ?? 0,
        });
      }
      const nextState = await mutateConversationState(
        conversationId,
        currentState,
        (state) => {
          state.pendingOperation = {
            originalPrompt: input.content,
            createdAt: new Date().toISOString(),
          };
        },
        input.expectedRevision,
      );

      const userMessage = await upsertUserMessage();

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
          revision: nextState.revision ?? 0,
        },
        { status: 200 },
      );
    }

    // =========================================================
    // Case 2: State-Only Selection (Zero credits)
    // =========================================================
    if (firstAction.type === "select_asset" && plan.actions.length === 1) {
      if (input.mode === "plan") {
        return NextResponse.json({
          mode: "plan", billable: false, action: firstAction.type,
          expectedRevision: currentState.revision ?? 0,
        });
      }
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

      let nextRevision = Number(currentState.revision ?? 0);
      if (selectedAssetId) {
        const nextState = await mutateConversationState(
          conversationId,
          currentState,
          (state) => {
            state.activeAssetId = selectedAssetId;
            if (isResumedClarification) {
              state.pendingOperation = null;
            }
          },
          input.expectedRevision,
        );
        nextRevision = Number(nextState.revision ?? nextRevision);
      }

      const userMessage = await upsertUserMessage();

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
          revision: nextRevision,
        },
        { status: 200 },
      );
    }

    // =========================================================
    // Case 3: Media Generation Action
    // =========================================================
    // Extract base effective generation spec from contextual job (prioritizing focused historical step)
    const contextualJob = sourceJob ?? latestJob;
    const basePayload =
      (contextualJob?.requestPayload as Record<string, unknown>) ?? {};
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
    // Empty dashboard conversations have no initial provider job. Discover
    // the first compatible model at admission rather than persisting a fake one.
    let needsCapabilityRouting = !plannerContext.currentModelId;

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
          }
        } else if (target.kind === "asset_id") {
          currentState.activeAssetId = target.assetId;
        }
      } else if (action.type === "change_aspect_ratio") {
        targetRatio = action.aspectRatio;
        // In an image conversation, "make it 9:16" refers to the focused
        // visual, not a brand-new prompt-only generation. Preserve that source
        // as a reference so reframing remains visually related to the asset.
        if (targetModality === "IMAGE") {
          const sourceAssetId =
            currentState.activeAssetId ??
            plannerContext.selectedAssetId ??
            undefined;
          if (sourceAssetId) {
            imageReferenceAssetIds = [sourceAssetId];
            needsCapabilityRouting = true;
          }
        }
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
        if (targetModality === "IMAGE") {
          const sourceAssetId =
            currentState.activeAssetId ??
            plannerContext.selectedAssetId ??
            undefined;
          if (sourceAssetId) {
            imageReferenceAssetIds = [sourceAssetId];
          }
        } else if (targetModality === "VIDEO") {
          const sourceAssetId =
            currentState.activeAssetId ??
            plannerContext.selectedAssetId ??
            undefined;
          const sourceIsImage = plannerContext.activeOutputGroup.some(
            (output) =>
              output.assetId === sourceAssetId &&
              output.mimeType.startsWith("image/"),
          );
          if (sourceAssetId && sourceIsImage) {
            firstFrameAssetId = firstFrameAssetId ?? sourceAssetId;
          }
        }
      } else if (action.type === "generate_video") {
        targetModality = "VIDEO";
        if (action.prompt) targetPrompt = action.prompt;
        if (action.firstFrameAssetId) {
          firstFrameAssetId = action.firstFrameAssetId;
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
        if (
          targetModality === "VOICE" &&
          (basePayload.text || basePayload.prompt)
        ) {
          targetPrompt = (basePayload.text || basePayload.prompt) as string;
        }
      } else if (action.type === "change_speaking_rate") {
        targetSpeechRate = action.speechRate;
        if (
          targetModality === "VOICE" &&
          (basePayload.text || basePayload.prompt)
        ) {
          targetPrompt = (basePayload.text || basePayload.prompt) as string;
        }
      } else if (action.type === "retry_generation") {
        const targetRetryJob = sourceJob ?? latestJob;
        if (!targetRetryJob) {
          throw new GenerationError("There is no generation to retry.", 409);
        }

        const RETRYABLE_TERMINAL_STATES = new Set(["FAILED", "CANCELLED"]);
        if (!RETRYABLE_TERMINAL_STATES.has(targetRetryJob.status)) {
          throw new GenerationError(
            `Generation in status ${targetRetryJob.status} cannot be retried. Only explicitly failed or cancelled generations are eligible for retry.`,
            409,
          );
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
        requireFirstFrame:
          targetModality === "VIDEO" && videoWorkflow === "FRAME_TO_VIDEO",
        requireExtendVideo:
          targetModality === "VIDEO" && videoWorkflow === "EXTEND",
        // Conversational video jobs request a durable last-frame asset only
        // if supported by the model, rather than forcing and failing admission.
        requireReturnLastFrame: false,
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

    // Binding the approval to the exact effective spec prevents stale
    // confirmations from silently executing a different model or prompt.
    const planFingerprint = createHash("sha256")
      .update(JSON.stringify({
        modality: targetModality, modelId: model.id,
        priceVersionId: priceVersion.id, prompt: targetPrompt,
        aspectRatio: targetRatio, resolution: targetResolution,
        outputCount: targetOutputCount, durationSeconds: targetDuration,
        voiceKey: targetVoiceKey, speechRate: targetSpeechRate,
        referenceAssetIds: imageReferenceAssetIds,
        videoWorkflow, firstFrameAssetId, videoSourceAssetId,
        extensionDirection,
        sourceGenerationId: sourceJob?.id ?? latestJob?.id ?? null,
      }))
      .digest("hex");
    if (input.mode === "execute" && input.planFingerprint &&
        input.planFingerprint !== planFingerprint) {
      throw new GenerationError(
        "The model, price or creative plan changed. Review the generation again.",
        409,
      );
    }

    // If client requested planning mode, return plan parameters before executing billable generation
    if (input.mode === "plan") {
      return NextResponse.json({
        mode: "plan",
        billable: true,
        planFingerprint,
        action: firstAction.type,
        targetModality,
        model: {
          id: model.id,
          provider: model.provider,
          displayName: model.displayName,
        },
        settings: {
          aspectRatio: targetRatio,
          resolution: targetResolution,
          outputCount: targetOutputCount,
          durationSeconds: targetDuration,
        },
        prompt: targetPrompt,
        sourceGenerationId: sourceJob?.id ?? latestJob?.id ?? null,
        expectedRevision: currentState.revision ?? 0,
        priceVersionId: priceVersion.id,
        referenceAssetIds: imageReferenceAssetIds,
        voiceKey: targetVoiceKey,
        speechRate: targetSpeechRate,
        videoWorkflow: targetModality === "VIDEO" ? videoWorkflow : undefined,
        firstFrameAssetId,
        videoSourceAssetId,
        extensionDirection,
        returnLastFrame:
          targetModality === "VIDEO" &&
          (model.capabilities as Record<string, unknown> | null)?.returnLastFrame === true,
      });
    }

    // Planning is read-only. Execution first claims the caller's conversation
    // revision under a row lock, before any billable generation job can be
    // admitted. This prevents a stale concurrent turn from reserving credits.
    const rateLimited = await generationLimiter.check(session.user.id);
    if (rateLimited) return rateLimited;

    const leaseStartedAt = new Date();
    const claimedState = await mutateConversationState(
      conversationId,
      currentState,
      (state) => {
        const activeLease = state.inFlightTurn;
        if (
          activeLease &&
          activeLease.idempotencyKey !== input.idempotencyKey &&
          Number.isFinite(Date.parse(activeLease.startedAt)) &&
          Date.parse(activeLease.startedAt) + CONVERSATION_TURN_LEASE_MS >
            leaseStartedAt.getTime()
        ) {
          throw new GenerationError(
            "Another conversation turn is still being admitted. Please retry after it finishes.",
            409,
          );
        }
        state.inFlightTurn = {
          idempotencyKey: input.idempotencyKey,
          startedAt: leaseStartedAt.toISOString(),
        };
      },
      input.expectedRevision,
    );
    conversationRevisionClaimed = true;
    claimedTurnId = input.idempotencyKey;

    // Create user message only after the revision claim succeeds.
    const userMessage = await upsertUserMessage();

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
      const modelCaps = (model.capabilities as Record<string, unknown>) ?? {};
      const returnLastFrame =
        targetModality === "VIDEO" && modelCaps.returnLastFrame === true;
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
        returnLastFrame,
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
        : (sourceJob?.id ??
          (latestJob?.id === job.id ? null : (latestJob?.id ?? null)));

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

    // Serialize conversation-state mutation under a row lock so concurrent
    // turns cannot overwrite each other's working state.
    const finalState = await mutateConversationState(
      conversationId,
      claimedState,
      (state) => {
        state.activeGenerationId = job.id;
        state.activeAssetId = null;
        state.activeOutputs = [];
        state.activeModality = targetModality;
        state.currentModelId = model.id;
        state.currentProvider = model.provider;
        state.settings = {
          aspectRatio: targetRatio,
          resolution: targetResolution,
          outputCount: targetOutputCount,
          durationSeconds: targetDuration,
          voiceKey: targetVoiceKey,
          speechRate: targetSpeechRate,
        };
        state.pendingOperation = null;
        if (state.inFlightTurn?.idempotencyKey === input.idempotencyKey) {
          state.inFlightTurn = null;
        }
      },
    );

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
        revision: finalState.revision ?? 0,
      },
      { status: 202 },
    );
  } catch (error) {
    if (claimedTurnId) {
      await releaseConversationTurnLease(conversationId, claimedTurnId).catch(
        () => undefined,
      );
    }
    const correlationId =
      request.headers.get("x-correlation-id") || crypto.randomUUID();
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid message data.", issues: error.issues, correlationId },
        { status: 400, headers: { "x-correlation-id": correlationId } },
      );
    }
    const isExpected = error instanceof GenerationError;
    const message = isExpected
      ? error.message
      : "Message turn execution failed. Please retry with the same request.";
    const status = isExpected ? error.status : 500;
    const code =
      status === 409 && message.startsWith("Conversation state was modified")
        ? "CONVERSATION_CONFLICT"
        : status === 409 && message.startsWith("Another conversation turn")
          ? "CONVERSATION_BUSY"
          : conversationRevisionClaimed
            ? "CONVERSATION_REFRESH_REQUIRED"
            : undefined;
    return NextResponse.json(
      { error: message, correlationId, ...(code ? { code } : {}) },
      { status, headers: { "x-correlation-id": correlationId } },
    );
  }
}
