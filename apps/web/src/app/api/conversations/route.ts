import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import {
  createImageJob,
  createVideoJob,
  createVoiceJob,
} from "@aiwa/generation";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import { generateConversationTitle } from "../../../lib/conversations/title-generator";
import type { ConversationState } from "../../../lib/conversations/types";

const conversationCreateSchema = z.object({
  organizationId: z.string().min(1).max(100),
  projectId: z.string().min(1).max(100).nullable().optional(),
  prompt: z.string().trim().min(1, "Prompt cannot be empty.").max(4000),
  modality: z.enum(["IMAGE", "VIDEO", "VOICE"]).default("IMAGE"),
  modelId: z.string().min(1).max(100),
  priceVersionId: z.string().min(1).max(100),
  quoteToken: z.string().min(1).max(2048),
  idempotencyKey: z.string().uuid(),
  aspectRatio: z.string().default("1:1"),
  resolution: z.string().default("2K"),
  outputCount: z.number().int().min(1).max(15).default(1),
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

    // Initial working state projection
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

    // Create durable ChatThread with threadType: "CREATIVE"
    const thread = await db.chatThread.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        createdById: session.user.id,
        title: "New creation",
        threadType: "CREATIVE",
        modelId: input.modelId,
        state: initialState as unknown as object,
      },
    });

    // Create initial user message
    const userMessage = await db.chatMessage.create({
      data: {
        threadId: thread.id,
        clientRequestId: input.idempotencyKey,
        role: "user",
        content: input.prompt,
      },
    });

    // Execute first generation job through canonical pipeline
    let job: { id: string; status: string };
    if (input.modality === "VOICE") {
      job = await createVoiceJob(session.user.id, {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
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
        modelId: input.modelId,
        priceVersionId: input.priceVersionId,
        quoteToken: input.quoteToken,
        idempotencyKey: input.idempotencyKey,
        prompt: input.prompt,
        durationSeconds: input.durationSeconds ?? 5,
        outputFormat: "mp4",
        schemaVersion: 2,
        workflow: "GENERATE",
        sources: [],
      });
    } else {
      job = await createImageJob(session.user.id, {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        modelId: input.modelId,
        priceVersionId: input.priceVersionId,
        quoteToken: input.quoteToken,
        idempotencyKey: input.idempotencyKey,
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
        outputCount: input.outputCount,
      });
    }

    // Link generation job to the thread
    await db.generationJob.update({
      where: { id: job.id },
      data: { chatThreadId: thread.id },
    });

    // Update thread state with active generation ID
    initialState.activeGenerationId = job.id;
    await db.chatThread.update({
      where: { id: thread.id },
      data: { state: initialState as unknown as object },
    });

    // Update user message metadata with generationJobId
    await db.chatMessage.update({
      where: { id: userMessage.id },
      data: { metadata: { generationJobId: job.id } },
    });

    // Parallel asynchronous title generation (non-blocking)
    void generateConversationTitle({
      conversationId: thread.id,
      initialPrompt: input.prompt,
    });

    return NextResponse.json(
      {
        conversationId: thread.id,
        jobId: job.id,
        title: "New creation",
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
