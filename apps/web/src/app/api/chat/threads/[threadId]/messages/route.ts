import { randomUUID } from "node:crypto";
import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { executeTextGeneration, GenerationError } from "@aiwa/generation";
import { chatMessageCreateSchema } from "@aiwa/validation";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
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

  const { threadId } = await params;

  try {
    const input = chatMessageCreateSchema.parse(await request.json());
    const thread = await db.chatThread.findUnique({
      where: { id: threadId },
      include: { persona: true },
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
      !hasOrganizationPermission(membership.role, "generation:create")
    ) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const targetModelId =
      thread.persona?.modelId ??
      thread.modelId ??
      "doubao-seed-character-260628";
    const now = new Date();
    const model = await db.providerModel.findFirst({
      where: {
        provider: "BYTEPLUS",
        providerModelId: targetModelId,
        mediaKind: "TEXT",
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
      return NextResponse.json(
        { error: "Model or pricing is unavailable for text generation." },
        { status: 409 },
      );
    }

    const recentMessages = await db.chatMessage.findMany({
      where: { threadId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
      select: { role: true, content: true },
    });

    const messagesPayload: Array<{
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
      if (message.role === "user" || message.role === "assistant") {
        messagesPayload.push({
          role: message.role,
          content: message.content,
        });
      }
    }
    messagesPayload.push({ role: "user", content: input.content });

    const genResult = await executeTextGeneration(session.user.id, {
      organizationId: thread.organizationId,
      projectId: thread.projectId,
      modelId: model.id,
      priceVersionId: model.priceVersions[0].id,
      idempotencyKey: input.idempotencyKey ?? randomUUID(),
      messages: messagesPayload,
      temperature: 0.7,
      maxTokens: 2048,
    });

    const persisted = await db.$transaction(async (tx) => {
      const userMessage = await tx.chatMessage.create({
        data: {
          threadId,
          role: "user",
          content: input.content,
          metadata: input.idempotencyKey
            ? { clientRequestId: input.idempotencyKey }
            : undefined,
        },
      });

      const assistantMessage = await tx.chatMessage.create({
        data: {
          threadId,
          role: "assistant",
          content: genResult.content,
          tokensUsed: genResult.usage?.totalTokens ?? null,
          metadata: {
            generationJobId: genResult.jobId,
            chargedCredits: genResult.chargedCredits,
            usage: genResult.usage,
            ...(input.idempotencyKey
              ? { clientRequestId: input.idempotencyKey }
              : {}),
          },
        },
      });

      await tx.chatThread.update({
        where: { id: threadId },
        data: { updatedAt: new Date() },
      });

      return { userMessage, assistantMessage };
    });

    return NextResponse.json(
      {
        userMessage: persisted.userMessage,
        message: persisted.assistantMessage,
        usage: genResult.usage,
        chargedCredits: genResult.chargedCredits,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid message data.", issues: error.issues },
        { status: 400 },
      );
    }
    if (error instanceof GenerationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "Text generation failed. Please try again." },
      { status: 502 },
    );
  }
}
