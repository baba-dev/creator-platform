import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveAvailableGenerationActions } from "@/lib/conversations/available-actions";
import { serializeGenerationJob } from "@/lib/conversations/serialization";
import { getRequestSession } from "@/lib/request-auth";

export const runtime = "nodejs";

const statusQuerySchema = z.object({
  ids: z
    .string()
    .transform((val) =>
      val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().min(1).max(100)).min(1).max(20)),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const { conversationId } = await params;
  const url = new URL(request.url);
  const parsed = statusQuerySchema.safeParse({
    ids: url.searchParams.get("ids") ?? "",
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid job ids list (must be 1-20 comma-separated IDs)." },
      { status: 400 },
    );
  }

  const thread = await db.chatThread.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      threadType: true,
      createdById: true,
      organizationId: true,
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

  if (!membership || membership.organization.status !== "ACTIVE") {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const jobs = await db.generationJob.findMany({
    where: {
      id: { in: parsed.data.ids },
      chatThreadId: conversationId,
      organizationId: thread.organizationId,
    },
    select: {
      id: true,
      status: true,
      errorCode: true,
      errorMessage: true,
      createdAt: true,
      reservedCredits: true,
      chargedCredits: true,
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
          providerModelId: true,
          displayName: true,
          mediaKind: true,
          capabilities: true,
        },
      },
    },
  });

  const availableActions = await resolveAvailableGenerationActions(jobs);

  return NextResponse.json(
    {
      jobs: jobs.map((job) =>
        serializeGenerationJob({
          ...job,
          availableActions: availableActions.get(job.id) ?? [],
        }),
      ),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
