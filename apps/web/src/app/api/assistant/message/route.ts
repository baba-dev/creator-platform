import { createHash } from "node:crypto";
import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import {
  buildAssistantMessages,
  completeAssistantResponse,
  getAssistantSettings,
  localPixelReply,
  pixelWorkspaceSchema,
  requirePixelAccess,
} from "@aiwa/assistant";
import {
  createTextJob,
  GenerationError,
  textResultFromJob,
} from "@aiwa/generation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { rateLimit } from "@/lib/rate-limit";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import {
  assertQuotedTextModel,
  issueTextFeatureQuote,
} from "@/lib/text-feature-generation";

const schema = z.object({
  threadId: z.string().min(1).max(100),
  content: z.string().trim().min(1).max(4000),
  idempotencyKey: z.string().uuid(),
  mode: z.enum(["local", "quote", "generate"]).default("generate"),
  workspace: pixelWorkspaceSchema.optional(),
  quoteToken: z.string().min(1).max(2048).optional(),
  quotedModelId: z.string().min(1).max(100).optional(),
  priceVersionId: z.string().min(1).max(100).optional(),
});
const limiter = rateLimit({ max: 60, windowMs: 60_000, prefix: "pixel-local" });

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
    const bodyText = await request.text();
    if (bodyText.length > 12000)
      return NextResponse.json(
        { error: "Request too large." },
        { status: 413 },
      );
    const input = schema.parse(JSON.parse(bodyText));
    const thread = await db.chatThread.findUnique({
      where: { id: input.threadId },
      include: { organization: true },
    });
    if (
      !thread ||
      thread.createdById !== session.user.id ||
      (thread.threadType !== "PIXEL" &&
        !(await db.persona.findFirst({
          where: { id: thread.personaId ?? "", tag: "aiwa-pixel-assistant" },
          select: { id: true },
        })))
    )
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
      !hasOrganizationPermission(membership.role, "workspace:view")
    )
      return NextResponse.json({ error: "Access denied." }, { status: 403 });

    const requestFingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          content: input.content,
          workspace: input.workspace ?? {},
        }),
      )
      .digest("hex");
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
    const priorFingerprint = (
      priorUser?.metadata as Record<string, unknown> | null
    )?.requestFingerprint;
    if (priorFingerprint && priorFingerprint !== requestFingerprint)
      return NextResponse.json(
        {
          error:
            "This request key was already used for a different workspace context.",
        },
        { status: 409 },
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
    const runInput = {
      organizationId: thread.organizationId,
      organizationSlug: thread.organization.slug,
      userId: session.user.id,
      threadId: thread.id,
      userMessage: input.content,
      idempotencyKey: input.idempotencyKey,
      workspace: input.workspace,
    };

    if (input.mode === "local") {
      const limited = await limiter.check(session.user.id);
      if (limited) return limited;
      const reply = await localPixelReply(input.content, {
        ...runInput,
        userMessage: input.content,
      });
      if (!reply) return NextResponse.json({ local: false });
      const result = await completeAssistantResponse({
        ...runInput,
        rawContent: reply.content,
        localToolResults: reply.toolResults,
        modelRecordId: "pixel-local",
        chargedCredits: 0,
      });
      return NextResponse.json({ ...result, local: true }, { status: 201 });
    }
    if (!hasOrganizationPermission(membership.role, "generation:create"))
      return NextResponse.json(
        { error: "AI generation access denied." },
        { status: 403 },
      );
    if (!settings.providerModel)
      return NextResponse.json(
        {
          error:
            "AI reasoning is unavailable. Local help and workspace lookups are still available.",
        },
        { status: 409 },
      );

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

    const persistedUser = await db.chatMessage.upsert({
      where: {
        threadId_clientRequestId_role: {
          threadId: thread.id,
          clientRequestId: input.idempotencyKey,
          role: "user",
        },
      },
      update: {},
      create: {
        threadId: thread.id,
        clientRequestId: input.idempotencyKey,
        role: "user",
        content: input.content,
        metadata: { workspace: input.workspace ?? {}, requestFingerprint },
      },
    });
    if (persistedUser && persistedUser.content !== input.content)
      return NextResponse.json(
        { error: "This request key was already used for different content." },
        { status: 409 },
      );
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

export async function DELETE(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });

  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  try {
    const threadId = z
      .string()
      .min(1)
      .max(100)
      .parse(new URL(request.url).searchParams.get("threadId"));
    const thread = await db.chatThread.findFirst({
      where: { id: threadId, createdById: session.user.id },
      include: { organization: true },
    });
    if (!thread)
      return NextResponse.json({ error: "Thread not found." }, { status: 404 });

    const ctx = {
      userId: session.user.id,
      organizationId: thread.organizationId,
      organizationSlug: thread.organization.slug,
      threadId,
      idempotencyKey: crypto.randomUUID(),
    };
    await requirePixelAccess(ctx);

    // Never remove the user message that anchors recovery for a durable text
    // job. The client also disables Clear chat while pending, but the server
    // re-checks so stale tabs cannot orphan an accepted request. A cutoff keeps
    // messages created by a concurrent send in another tab out of this clear.
    const clearCutoff = new Date();
    const latest = await db.chatMessage.findMany({
      where: { threadId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    });
    const unresolved = latest
      .filter(
        (message) =>
          message.role === "user" &&
          message.clientRequestId &&
          !latest.some(
            (reply) =>
              reply.role === "assistant" &&
              reply.clientRequestId === message.clientRequestId,
          ),
      )
      .slice(0, 5);

    for (const message of unresolved) {
      const key = createHash("sha256")
        .update(
          `${thread.organizationId}:${session.user.id}:${message.clientRequestId}`,
        )
        .digest("hex");
      const job = await db.generationJob.findFirst({
        where: {
          idempotencyKey: key,
          organizationId: thread.organizationId,
          createdById: session.user.id,
        },
        select: { status: true },
      });
      const recentlyCreatedWithoutJob =
        !job &&
        message.createdAt.getTime() > clearCutoff.getTime() - 60_000;
      if (
        recentlyCreatedWithoutJob ||
        (job &&
          !["FAILED", "CANCELLED", "MANUAL_REVIEW"].includes(job.status))
      )
        return NextResponse.json(
          {
            error:
              "Pixel is still handling a saved request. Clear chat after it finishes or reaches a final state.",
          },
          { status: 409 },
        );
    }

    const cleared = await db.chatMessage.deleteMany({
      where: {
        threadId,
        role: { in: ["user", "assistant"] },
        createdAt: { lte: clearCutoff },
      },
    });
    return NextResponse.json(
      { cleared: true, deletedCount: cleared.count },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: "Invalid thread." }, { status: 400 });
    return NextResponse.json(
      {
        error:
          error instanceof GenerationError
            ? error.message
            : "Could not clear Pixel chat.",
      },
      { status: error instanceof GenerationError ? error.status : 500 },
    );
  }
}

/** Reconcile existing jobs only. Reopening Pixel never submits provider work. */
export async function GET(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  try {
    const threadId = z
      .string()
      .min(1)
      .max(100)
      .parse(new URL(request.url).searchParams.get("threadId"));
    const thread = await db.chatThread.findFirst({
      where: { id: threadId, createdById: session.user.id },
      include: { organization: true },
    });
    if (!thread)
      return NextResponse.json({ error: "Thread not found." }, { status: 404 });
    const ctx = {
      userId: session.user.id,
      organizationId: thread.organizationId,
      organizationSlug: thread.organization.slug,
      threadId,
      idempotencyKey: crypto.randomUUID(),
    };
    await requirePixelAccess(ctx);
    if (!(await getAssistantSettings()).enabled)
      return NextResponse.json(
        { error: "Pixel is disabled." },
        { status: 403 },
      );
    const requestId = new URL(request.url).searchParams.get("requestId");
    if (requestId) z.string().uuid().parse(requestId);
    const messages = await db.chatMessage.findMany({
      where: { threadId, ...(requestId ? { clientRequestId: requestId } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    });
    let pending = false;
    for (const message of messages
      .filter(
        (m) =>
          m.role === "user" &&
          m.clientRequestId &&
          !messages.some(
            (reply) =>
              reply.role === "assistant" &&
              reply.clientRequestId === m.clientRequestId,
          ),
      )
      .slice(0, 5)) {
      const key = createHash("sha256")
        .update(
          `${thread.organizationId}:${session.user.id}:${message.clientRequestId}`,
        )
        .digest("hex");
      const job = await db.generationJob.findFirst({
        where: {
          idempotencyKey: key,
          organizationId: thread.organizationId,
          createdById: session.user.id,
        },
      });
      if (!job) continue;
      const generated = textResultFromJob(job);
      if (generated) {
        const metadata = message.metadata as Record<string, unknown> | null;
        await completeAssistantResponse({
          ...ctx,
          idempotencyKey: message.clientRequestId!,
          userMessage: message.content,
          workspace: pixelWorkspaceSchema.safeParse(metadata?.workspace).data,
          rawContent: generated.content,
          modelRecordId: job.providerModelId,
          chargedCredits: generated.chargedCredits,
          jobId: job.id,
          providerRequestId: generated.providerRequestId,
          usage: generated.usage,
        });
      } else if (!["FAILED", "CANCELLED", "MANUAL_REVIEW"].includes(job.status))
        pending = true;
    }
    const latest = await db.chatMessage.findMany({
      where: { threadId, ...(requestId ? { clientRequestId: requestId } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    });
    if (requestId) {
      z.string().uuid().parse(requestId);
      const reply = latest.find(
        (m) => m.role === "assistant" && m.clientRequestId === requestId,
      );
      if (reply)
        return NextResponse.json(
          {
            content: reply.content,
            assistantMessageId: reply.id,
            userMessageId: latest.find(
              (m) => m.role === "user" && m.clientRequestId === requestId,
            )?.id,
            ...((reply.metadata as Record<string, unknown> | null) ?? {}),
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      const key = createHash("sha256")
        .update(`${thread.organizationId}:${session.user.id}:${requestId}`)
        .digest("hex");
      const job = await db.generationJob.findFirst({
        where: {
          idempotencyKey: key,
          organizationId: thread.organizationId,
          createdById: session.user.id,
        },
        select: { id: true, status: true },
      });
      if (!job)
        return NextResponse.json(
          { error: "Pixel request not found." },
          { status: 404 },
        );
      if (["FAILED", "CANCELLED", "MANUAL_REVIEW"].includes(job.status))
        return NextResponse.json(
          {
            error: `Pixel request is ${job.status.toLowerCase().replaceAll("_", " ")}. Inspect History before retrying.`,
            jobId: job.id,
          },
          { status: 409 },
        );
      return NextResponse.json(
        { pending: true, jobId: job.id },
        { status: 202, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { messages: latest.reverse(), pending },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof GenerationError
            ? error.message
            : "Could not refresh Pixel history.",
      },
      { status: error instanceof GenerationError ? error.status : 500 },
    );
  }
}
