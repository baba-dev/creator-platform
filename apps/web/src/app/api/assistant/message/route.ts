import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import {
  buildAssistantMessages,
  completeAssistantResponse,
  getAssistantSettings,
} from "@aiwa/assistant";
import {
  createTextJob,
  GenerationError,
  textResultFromJob,
} from "@aiwa/generation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import {
  assertQuotedTextModel,
  issueTextFeatureQuote,
} from "@/lib/text-feature-generation";

const schema = z.object({
  threadId: z.string().min(1).max(100),
  content: z.string().trim().min(1).max(4000),
  idempotencyKey: z.string().uuid(),
  mode: z.enum(["quote", "generate"]).default("generate"),
  quoteToken: z.string().min(1).max(2048).optional(),
  quotedModelId: z.string().min(1).max(100).optional(),
  priceVersionId: z.string().min(1).max(100).optional(),
});

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });

  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  try {
    const input = schema.parse(await request.json());
    const thread = await db.chatThread.findUnique({
      where: { id: input.threadId },
      include: { organization: true },
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

    const priorMessages = await db.chatMessage.findMany({
      where: {
        threadId: thread.id,
        clientRequestId: input.idempotencyKey,
        role: { in: ["user", "assistant"] },
      },
      select: { id: true, role: true, content: true, metadata: true },
    });
    const priorUser = priorMessages.find((message) => message.role === "user");
    const priorAssistant = priorMessages.find(
      (message) => message.role === "assistant",
    );
    if (priorUser && priorUser.content !== input.content)
      return NextResponse.json(
        { error: "This request key was already used for different content." },
        { status: 409 },
      );

    if (priorAssistant) {
      const metadata =
        (priorAssistant.metadata as Record<string, unknown> | null) ?? {};
      return NextResponse.json(
        {
          content: priorAssistant.content,
          toolResults: Array.isArray(metadata.toolResults)
            ? metadata.toolResults
            : [],
          navigationRoute:
            typeof metadata.navigationRoute === "string"
              ? metadata.navigationRoute
              : undefined,
          reminderId:
            typeof metadata.reminderId === "string"
              ? metadata.reminderId
              : undefined,
          ticketRef:
            typeof metadata.ticketRef === "string"
              ? metadata.ticketRef
              : undefined,
          jobId:
            typeof metadata.jobId === "string" ? metadata.jobId : undefined,
          chargedCredits:
            typeof metadata.chargedCredits === "number"
              ? metadata.chargedCredits
              : 0,
          userMessageId: priorUser?.id,
          assistantMessageId: priorAssistant.id,
          replayed: true,
        },
        { status: 201 },
      );
    }

    const settings = await getAssistantSettings();
    if (!settings.enabled)
      return NextResponse.json(
        { error: "The AI Assistant is currently disabled." },
        { status: 403 },
      );
    if (!settings.providerModel)
      return NextResponse.json(
        { error: "Pixel has no available text model." },
        { status: 409 },
      );

    const runInput = {
      organizationId: thread.organizationId,
      organizationSlug: thread.organization.slug,
      userId: session.user.id,
      threadId: thread.id,
      userMessage: input.content,
      idempotencyKey: input.idempotencyKey,
    };

    const messages = await buildAssistantMessages(runInput, settings);
    const maxTokens = 1024;
    if (input.mode === "quote") {
      const quote = await issueTextFeatureQuote({
        organizationId: thread.organizationId,
        userId: session.user.id,
        modelId: settings.providerModel.id,
        messages,
        maxTokens,
      });
      return NextResponse.json({
        quote:
          settings.pricingMode === "FREE"
            ? {
                ...quote,
                estimatedCredits: "0",
                maximumChargeCredits: "0",
                isFree: true,
              }
            : quote,
      });
    }

    if (!input.quoteToken || !input.quotedModelId || !input.priceVersionId)
      return NextResponse.json(
        { error: "A fresh generation quote is required." },
        { status: 400 },
      );

    await assertQuotedTextModel(input.quotedModelId, settings.providerModel.id);

    const sponsored = settings.pricingMode === "FREE";
    if (sponsored) {
      const recentSponsoredJobs = await db.generationJob.count({
        where: {
          organizationId: thread.organizationId,
          createdById: session.user.id,
          providerModelId: settings.providerModel.id,
          createdAt: { gte: new Date(Date.now() - 60_000) },
        },
      });
      if (recentSponsoredJobs >= 20)
        return NextResponse.json(
          {
            error:
              "Pixel is receiving requests too quickly. Please retry shortly.",
          },
          { status: 429 },
        );
    }

    const job = await createTextJob(
      session.user.id,
      {
        organizationId: thread.organizationId,
        modelId: input.quotedModelId,
        priceVersionId: input.priceVersionId,
        quoteToken: input.quoteToken,
        idempotencyKey: input.idempotencyKey,
        messages,
        temperature: 0.7,
        maxTokens,
      },
      { sponsored },
    );

    const generated = textResultFromJob(job);
    if (!generated)
      return NextResponse.json(
        { jobId: job.id, status: job.status, pending: true },
        { status: 202 },
      );

    const result = await completeAssistantResponse({
      ...runInput,
      rawContent: generated.content,
      modelRecordId: settings.providerModel.id,
      chargedCredits: generated.chargedCredits,
      jobId: generated.jobId,
      providerRequestId: generated.providerRequestId,
      usage: generated.usage,
    });
    return NextResponse.json(result, { status: 201 });
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
    return NextResponse.json(
      { error: "Assistant request failed. Please try again." },
      { status: 502 },
    );
  }
}
