import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import {
  createTextJob,
  createVoiceJob,
  GenerationError,
  textResultFromJob,
} from "@aiwa/generation";
import { chatMessageCreateSchema } from "@aiwa/validation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolvePersistedChatModel } from "@/lib/chat-model-selection";
import { deterministicUuid } from "@/lib/idempotency";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import {
  assertQuotedTextModel,
  issueTextFeatureQuote,
} from "@/lib/text-feature-generation";
import { StudioModelUnavailableError } from "@/lib/studio-model-discovery";

const chatGenerationSchema = chatMessageCreateSchema
  .extend({
    mode: z.enum(["quote", "generate"]).default("generate"),
    quoteToken: z.string().min(1).max(2048).optional(),
    quotedModelId: z.string().min(1).max(100).optional(),
    priceVersionId: z.string().min(1).max(100).optional(),
  })
  .superRefine((value, context) => {
    if (
      value.mode === "generate" &&
      (!value.quoteToken || !value.quotedModelId || !value.priceVersionId)
    )
      context.addIssue({
        code: "custom",
        message: "A fresh generation quote is required.",
      });
  });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });

  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const { threadId } = await params;

  try {
    const input = chatGenerationSchema.parse(await request.json());
    const thread = await db.chatThread.findUnique({
      where: { id: threadId },
      include: { persona: true },
    });
    if (!thread || thread.createdById !== session.user.id)
      return NextResponse.json({ error: "Thread not found." }, { status: 404 });

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
    )
      return NextResponse.json({ error: "Access denied." }, { status: 403 });

    // The thread model is immutable for billing/provenance. A persona only
    // supplies a default when a new thread is created.
    const targetModel = await resolvePersistedChatModel({
      modelId: thread.modelId,
      providerModelRecordId: thread.providerModelRecordId,
    });
    const recentMessages = await db.chatMessage.findMany({
      where: {
        threadId,
        OR: [
          { clientRequestId: null },
          { clientRequestId: { not: input.idempotencyKey } },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
      select: { role: true, content: true },
    });

    const messages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [
      {
        role: "system",
        content:
          thread.systemPrompt ??
          thread.persona?.systemPrompt ??
          "You are a helpful, creative and knowledgeable assistant.",
      },
    ];
    for (const message of recentMessages.reverse()) {
      if (message.role === "user" || message.role === "assistant")
        messages.push({ role: message.role, content: message.content });
    }
    messages.push({ role: "user", content: input.content });
    const maxTokens = 2048;

    if (input.mode === "quote") {
      const quote = await issueTextFeatureQuote({
        organizationId: thread.organizationId,
        userId: session.user.id,
        modelId: targetModel.id,
        messages,
        maxTokens,
      });
      return NextResponse.json({ quote });
    }

    await assertQuotedTextModel(input.quotedModelId!, targetModel.id);
    const job = await createTextJob(session.user.id, {
      organizationId: thread.organizationId,
      projectId: thread.projectId,
      modelId: input.quotedModelId,
      priceVersionId: input.priceVersionId,
      quoteToken: input.quoteToken,
      idempotencyKey: input.idempotencyKey,
      chatThreadId: threadId,
      chatOptions: {
        autoVoice: input.autoVoice,
        voiceKey: thread.persona?.voiceKey || "jasper",
        speechRate: 1,
      },
      messages,
      temperature: 0.7,
      maxTokens,
    });

    const userMessage = await db.chatMessage.upsert({
      where: {
        threadId_clientRequestId_role: {
          threadId,
          clientRequestId: input.idempotencyKey,
          role: "user",
        },
      },
      update: {},
      create: {
        threadId,
        clientRequestId: input.idempotencyKey,
        role: "user",
        content: input.content,
        metadata: { generationJobId: job.id },
      },
    });

    const result = textResultFromJob(job);
    if (!result)
      return NextResponse.json(
        {
          jobId: job.id,
          status: job.status,
          pending: true,
          userMessage,
        },
        { status: 202 },
      );

    let audioJobId: string | undefined;
    if (input.autoVoice && result.content.trim()) {
      try {
        const now = new Date();
        const voiceModel = await db.providerModel.findFirst({
          where: {
            mediaKind: "VOICE",
            provider: "BYTEPLUS",
            providerModelId: "seed-tts-2.0",
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
        if (voiceModel?.priceVersions[0]) {
          const voiceKey = thread.persona?.voiceKey || "jasper";
          const voiceIdempotencyKey = deterministicUuid(
            [
              "chat-auto-voice-v2",
              result.jobId,
              voiceModel.id,
              voiceModel.priceVersions[0].id,
              voiceKey,
              result.content,
            ].join("\u0000"),
          );
          const voiceJob = await createVoiceJob(session.user.id, {
            organizationId: thread.organizationId,
            projectId: thread.projectId,
            modelId: voiceModel.id,
            priceVersionId: voiceModel.priceVersions[0].id,
            idempotencyKey: voiceIdempotencyKey,
            text: result.content,
            voiceKey,
            speechRate: 1,
            format: "mp3",
          });
          audioJobId = voiceJob.id;
        }
      } catch {
        // Text success is durable; optional auto-voice may be retried separately.
      }
    }

    const assistantMessage = await db.chatMessage.upsert({
      where: {
        threadId_clientRequestId_role: {
          threadId,
          clientRequestId: input.idempotencyKey,
          role: "assistant",
        },
      },
      update: {
        content: result.content,
        tokensUsed: result.usage?.totalTokens ?? null,
        metadata: {
          generationJobId: result.jobId,
          chargedCredits: result.chargedCredits,
          usage: result.usage,
          ...(audioJobId ? { audioJobId } : {}),
        },
      },
      create: {
        threadId,
        clientRequestId: input.idempotencyKey,
        role: "assistant",
        content: result.content,
        tokensUsed: result.usage?.totalTokens ?? null,
        metadata: {
          generationJobId: result.jobId,
          chargedCredits: result.chargedCredits,
          usage: result.usage,
          ...(audioJobId ? { audioJobId } : {}),
        },
      },
    });
    await db.chatThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json(
      {
        userMessage,
        message: { ...assistantMessage, audioJobId },
        audioJobId,
        usage: result.usage,
        chargedCredits: result.chargedCredits,
        jobId: result.jobId,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: "Invalid message data.", issues: error.issues },
        { status: 400 },
      );
    if (error instanceof GenerationError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (error instanceof StudioModelUnavailableError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json(
      { error: "Text generation failed. Please try again." },
      { status: 502 },
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  const { threadId } = await params;
  const thread = await db.chatThread.findUnique({
    where: { id: threadId },
    select: { organizationId: true, createdById: true },
  });
  if (!thread || thread.createdById !== session.user.id) {
    return NextResponse.json({ error: "Thread not found." }, { status: 404 });
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
    !hasOrganizationPermission(membership.role, "workspace:view")
  ) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const url = new URL(request.url);
  const clientRequestId = url.searchParams.get("clientRequestId");

  if (clientRequestId) {
    const assistantMessage = await db.chatMessage.findUnique({
      where: {
        threadId_clientRequestId_role: {
          threadId,
          clientRequestId,
          role: "assistant",
        },
      },
    });

    if (assistantMessage) {
      const userMessage = await db.chatMessage.findUnique({
        where: {
          threadId_clientRequestId_role: {
            threadId,
            clientRequestId,
            role: "user",
          },
        },
      });
      const metadata =
        (assistantMessage.metadata as Record<string, unknown> | null) ?? {};
      return NextResponse.json({
        status: "SUCCEEDED",
        complete: true,
        userMessage,
        message: assistantMessage,
        audioJobId: metadata.audioJobId,
      });
    }

    const userMessage = await db.chatMessage.findUnique({
      where: {
        threadId_clientRequestId_role: {
          threadId,
          clientRequestId,
          role: "user",
        },
      },
    });
    const jobId = (userMessage?.metadata as Record<string, unknown> | null)
      ?.generationJobId as string | undefined;
    if (jobId) {
      const job = await db.generationJob.findUnique({
        where: { id: jobId },
        select: { status: true, errorCode: true, errorMessage: true },
      });
      if (
        job?.status === "FAILED" ||
        job?.status === "CANCELLED" ||
        job?.status === "MANUAL_REVIEW"
      ) {
        return NextResponse.json(
          {
            status: job.status,
            complete: true,
            error:
              job.errorMessage ??
              (job.status === "MANUAL_REVIEW"
                ? "Generation requires provider or billing reconciliation."
                : "Generation failed."),
            errorCode: job.errorCode,
          },
          { status: job.status === "MANUAL_REVIEW" ? 409 : 400 },
        );
      }
      return NextResponse.json(
        {
          status: job?.status ?? "PROCESSING",
          complete: false,
          jobId,
          userMessage,
        },
        { status: 202 },
      );
    }

    return NextResponse.json(
      { status: "PROCESSING", complete: false },
      { status: 202 },
    );
  }

  const beforeCursor = url.searchParams.get("before");
  const limit = Math.min(
    Math.max(1, Number(url.searchParams.get("limit") || 50)),
    100,
  );

  const rawMessages = await db.chatMessage.findMany({
    where: {
      threadId,
      ...(beforeCursor ? { createdAt: { lt: new Date(beforeCursor) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
  });

  const hasMore = rawMessages.length > limit;
  const items = hasMore ? rawMessages.slice(0, limit) : rawMessages;
  const lastItem = items.length > 0 ? items[items.length - 1] : undefined;
  const nextCursor =
    hasMore && lastItem ? lastItem.createdAt.toISOString() : null;

  return NextResponse.json({
    messages: items.reverse(),
    nextCursor,
  });
}
