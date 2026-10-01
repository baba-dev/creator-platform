import { randomUUID } from "node:crypto";
import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { executeTextGeneration } from "@aiwa/generation";
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
    const json = await request.json();
    const input = chatMessageCreateSchema.parse({
      ...json,
      threadId,
    });

    const thread = await db.chatThread.findUnique({
      where: { id: threadId },
      include: {
        persona: true,
        messages: {
          orderBy: { createdAt: "asc" },
          take: 30,
        },
      },
    });

    if (!thread) {
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

    // Save user message first
    const userMessage = await db.chatMessage.create({
      data: {
        threadId,
        role: "user",
        content: input.content,
      },
    });

    // Determine model and system prompt
    const targetModelId =
      thread.persona?.modelId ||
      thread.modelId ||
      "doubao-seed-character-260628";
    const now = new Date();
    const model = await db.providerModel.findFirst({
      where: {
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
        { status: 400 },
      );
    }

    const systemPromptText =
      thread.systemPrompt ||
      thread.persona?.systemPrompt ||
      "You are a helpful, creative and knowledgeable assistant.";

    const messagesPayload: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [{ role: "system", content: systemPromptText }];

    for (const msg of thread.messages) {
      if (msg.role === "user" || msg.role === "assistant") {
        messagesPayload.push({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        });
      }
    }
    messagesPayload.push({ role: "user", content: input.content });

    const idempotencyKey = randomUUID();
    const genResult = await executeTextGeneration(session.user.id, {
      organizationId: thread.organizationId,
      projectId: thread.projectId,
      modelId: model.id,
      priceVersionId: model.priceVersions[0].id,
      idempotencyKey,
      messages: messagesPayload,
      temperature: 0.7,
      maxTokens: 2048,
    });

    // Save assistant message
    const assistantMessage = await db.chatMessage.create({
      data: {
        threadId,
        role: "assistant",
        content: genResult.content,
        tokensUsed: genResult.usage?.totalTokens ?? null,
        metadata: {
          generationJobId: genResult.jobId,
          chargedCredits: genResult.chargedCredits,
          usage: genResult.usage,
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
        message: assistantMessage,
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
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Message processing failed.",
      },
      { status: 500 },
    );
  }
}
