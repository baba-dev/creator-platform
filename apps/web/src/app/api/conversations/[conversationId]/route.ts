import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

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
  const thread = await db.chatThread.findUnique({
    where: { id: conversationId },
    include: {
      generationJobs: {
        orderBy: { createdAt: "desc" },
        take: 10,
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
  if (!membership || membership.organization.status !== "ACTIVE") {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const rawMessagesDesc = await db.chatMessage.findMany({
    where: { threadId: conversationId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const rawMessages = rawMessagesDesc.reverse();

  return NextResponse.json(
    {
      conversation: {
        id: thread.id,
        organizationId: thread.organizationId,
        title: thread.title,
        threadType: thread.threadType,
        state: thread.state,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        messages: rawMessages,
        generationJobs: thread.generationJobs,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

const updateSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title cannot be empty.")
    .max(100, "Title is too long."),
});

export async function PATCH(
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
    select: { id: true, organizationId: true, createdById: true },
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

  try {
    const json = await request.json();
    const input = updateSchema.parse(json);

    const updated = await db.chatThread.update({
      where: { id: conversationId },
      data: { title: input.title },
      select: { id: true, title: true, state: true, updatedAt: true },
    });

    return NextResponse.json({ conversation: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? "Invalid data." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Failed to update conversation." },
      { status: 500 },
    );
  }
}

export async function DELETE(
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
    select: { id: true, organizationId: true, createdById: true },
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

  await db.chatThread.delete({ where: { id: conversationId } });
  return NextResponse.json({ success: true });
}
