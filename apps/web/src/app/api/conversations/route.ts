import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import {
  createImageJob,
  createVideoJob,
  createVoiceJob,
} from "@aiwa/generation";
import { NextResponse, after } from "next/server";
import { z } from "zod";

import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import {
  deriveDeterministicTitle,
  generateConversationTitle,
} from "@/lib/conversations/title-generator";
import type { ConversationState } from "@/lib/conversations/types";

const conversationCreateSchema = z.object({
  organizationId: z.string().min(1).max(100),
  projectId: z.string().min(1).max(100).nullable().optional(),
  templateId: z.string().min(1).max(100).optional(),
  prompt: z.string().trim().min(1, "Prompt cannot be empty.").max(4000),
  modality: z.enum(["IMAGE", "VIDEO", "VOICE"]).default("IMAGE"),
  modelId: z.string().min(1).max(100),
  priceVersionId: z.string().min(1).max(100),
  quoteToken: z.string().min(1).max(2048),
  idempotencyKey: z.string().uuid(),
  aspectRatio: z.string().default("1:1"),
  resolution: z.string().default("2K"),
  outputCount: z.number().int().min(1).max(15).default(1),
  referenceAssetIds: z.array(z.string().min(1).max(100)).max(14).optional(),
  durationSeconds: z.number().int().min(1).max(30).optional(),
  voiceKey: z.string().optional(),
  speechRate: z.number().min(0.5).max(2.0).optional(),
});

export async function GET(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  if (!organizationId) {
    return NextResponse.json(
      { error: "organizationId is required." },
      { status: 400 },
    );
  }

  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId: session.user.id,
      },
    },
    include: { organization: true },
  });
  if (!membership || membership.organization.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "Workspace access denied." },
      { status: 403 },
    );
  }

  const threads = await db.chatThread.findMany({
    where: {
      organizationId,
      createdById: session.user.id,
      threadType: "CREATIVE",
    },
    select: {
      id: true,
      title: true,
      threadType: true,
      createdAt: true,
      updatedAt: true,
      state: true,
      _count: { select: { messages: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ conversations: threads });
}

export async function POST(request: Request) {
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

  try {
    const json = await request.json();
    const input = conversationCreateSchema.parse(json);

    const membership = await db.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: input.organizationId,
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
      return NextResponse.json(
        { error: "Workspace access denied." },
        { status: 403 },
      );
    }

    // Build the working state, but queue the canonical generation first.
    // Quote/model/balance rejection must not leave an orphan conversation.
    const initialState: ConversationState = {
      activeModality: input.modality,
      currentModelId: input.modelId,
      settings: {
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
        outputCount: input.outputCount,
        durationSeconds: input.durationSeconds ?? 5,
        voiceKey: input.voiceKey ?? "jasper",
        speechRate: input.speechRate ?? 1.0,
      },
      activeOutputs: [],
    };

    let job: { id: string; status: string };
    if (input.modality === "VOICE") {
      job = await createVoiceJob(session.user.id, {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        templateId: input.templateId,
        modelId: input.modelId,
        priceVersionId: input.priceVersionId,
        quoteToken: input.quoteToken,
        idempotencyKey: input.idempotencyKey,
        text: input.prompt,
        voiceKey: input.voiceKey ?? "jasper",
        speechRate: input.speechRate ?? 1.0,
        format: "mp3",
      });
    } else if (input.modality === "VIDEO") {
      job = await createVideoJob(session.user.id, {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        templateId: input.templateId,
        modelId: input.modelId,
        priceVersionId: input.priceVersionId,
        quoteToken: input.quoteToken,
        idempotencyKey: input.idempotencyKey,
        prompt: input.prompt,
        durationSeconds: input.durationSeconds ?? 5,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
        outputFormat: "mp4",
        schemaVersion: 2,
        workflow: "GENERATE",
        sources: [],
      });
    } else {
      job = await createImageJob(session.user.id, {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        templateId: input.templateId,
        modelId: input.modelId,
        priceVersionId: input.priceVersionId,
        quoteToken: input.quoteToken,
        idempotencyKey: input.idempotencyKey,
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
        outputCount: input.outputCount,
        referenceAssetIds: input.referenceAssetIds ?? [],
      });
    }

    const durableJob = await db.generationJob.findUnique({
      where: { id: job.id },
      select: { chatThreadId: true },
    });

    const ensureInitialMessage = (threadId: string) =>
      db.chatMessage.upsert({
        where: {
          threadId_clientRequestId_role: {
            threadId,
            clientRequestId: input.idempotencyKey,
            role: "user",
          },
        },
        update: {
          content: input.prompt,
          metadata: { generationJobId: job.id },
        },
        create: {
          threadId,
          clientRequestId: input.idempotencyKey,
          role: "user",
          content: input.prompt,
          metadata: { generationJobId: job.id },
        },
      });

    // A retried HTTP request returns the already-linked creative conversation.
    if (durableJob?.chatThreadId) {
      const existingThread = await db.chatThread.findFirst({
        where: {
          id: durableJob.chatThreadId,
          organizationId: input.organizationId,
          createdById: session.user.id,
          threadType: "CREATIVE",
        },
        select: { id: true, title: true },
      });
      if (existingThread) {
        await ensureInitialMessage(existingThread.id);
        return NextResponse.json(
          {
            conversationId: existingThread.id,
            jobId: job.id,
            title: existingThread.title,
            status: job.status,
          },
          { status: 200 },
        );
      }
    }

    const initialTitle = deriveDeterministicTitle(input.prompt);
    initialState.activeGenerationId = job.id;
    const thread = await db.chatThread.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        createdById: session.user.id,
        title: initialTitle,
        threadType: "CREATIVE",
        modelId: input.modelId,
        state: initialState as unknown as object,
      },
    });

    // Exactly one concurrent replay may claim the durable job.
    const claim = await db.generationJob.updateMany({
      where: { id: job.id, chatThreadId: null },
      data: { chatThreadId: thread.id },
    });

    if (claim.count === 0) {
      await db.chatThread.delete({ where: { id: thread.id } });
      const winnerJob = await db.generationJob.findUnique({
        where: { id: job.id },
        select: { chatThreadId: true },
      });
      const winnerThread = winnerJob?.chatThreadId
        ? await db.chatThread.findFirst({
            where: {
              id: winnerJob.chatThreadId,
              organizationId: input.organizationId,
              createdById: session.user.id,
              threadType: "CREATIVE",
            },
            select: { id: true, title: true },
          })
        : null;
      if (!winnerThread) {
        throw new Error(
          "Generation was queued but conversation linking failed.",
        );
      }
      await ensureInitialMessage(winnerThread.id);
      return NextResponse.json(
        {
          conversationId: winnerThread.id,
          jobId: job.id,
          title: winnerThread.title,
          status: job.status,
        },
        { status: 200 },
      );
    }

    await ensureInitialMessage(thread.id);

    // Refine the immediately useful deterministic title without blocking the
    // durable generation/thread handoff.
    const triggerTitleGeneration = () => {
      void generateConversationTitle({
        conversationId: thread.id,
        initialPrompt: input.prompt,
      }).catch((err) => {
        console.error(
          "Failed to generate conversation title in background",
          err,
        );
      });
    };

    try {
      after(triggerTitleGeneration);
    } catch {
      triggerTitleGeneration();
    }

    return NextResponse.json(
      {
        conversationId: thread.id,
        jobId: job.id,
        title: initialTitle,
        status: job.status,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid conversation parameters.", issues: error.issues },
        { status: 400 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Failed to create conversation.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
