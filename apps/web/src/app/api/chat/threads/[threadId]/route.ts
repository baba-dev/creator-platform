import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { clientChatModelReference } from "@/lib/chat-model-selection";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import { getAvailableStudioModels } from "@/lib/studio-model-discovery";

const personaSelect = {
  id: true,
  name: true,
  avatarUrl: true,
  tag: true,
  description: true,
  systemPrompt: true,
  voiceKey: true,
  modelId: true,
  providerModelRecordId: true,
  isPreset: true,
} as const;

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
    select: {
      id: true,
      organizationId: true,
      projectId: true,
      createdById: true,
      personaId: true,
      title: true,
      modelId: true,
      providerModelRecordId: true,
      systemPrompt: true,
      createdAt: true,
      updatedAt: true,
      persona: { select: personaSelect },
    },
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
  if (!membership || membership.organization.status !== "ACTIVE") {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const [newestMessages, discovery] = await Promise.all([
    db.chatMessage.findMany({
      where: { threadId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
    }),
    getAvailableStudioModels("character-chat"),
  ]);
  const messages = newestMessages.reverse();

  const jobIds = messages
    .map((message) => {
      const metadata = message.metadata as Record<string, unknown> | null;
      return metadata?.audioJobId as string | undefined;
    })
    .filter((id): id is string => typeof id === "string");

  const [assets, audioJobs] = jobIds.length
    ? await Promise.all([
        db.asset.findMany({
          where: {
            generationJobId: { in: jobIds },
            mediaKind: "AUDIO",
            status: "READY",
          },
          select: { id: true, generationJobId: true },
        }),
        db.generationJob.findMany({
          where: {
            id: { in: jobIds },
            organizationId: thread.organizationId,
            createdById: session.user.id,
            providerModel: { mediaKind: "VOICE" },
          },
          select: { id: true, status: true, errorCode: true },
        }),
      ])
    : [[], []];

  const assetByJobId = new Map(
    assets.map((asset) => [asset.generationJobId, asset.id]),
  );
  const audioJobById = new Map(audioJobs.map((job) => [job.id, job]));
  const enrichedMessages = messages.map((message) => {
    const metadata = (message.metadata as Record<string, unknown> | null) ?? {};
    const audioJobId = metadata.audioJobId as string | undefined;
    const audioJob = audioJobId ? audioJobById.get(audioJobId) : undefined;
    return {
      ...message,
      audioJobId,
      audioAssetId: audioJobId ? assetByJobId.get(audioJobId) : undefined,
      audioStatus: audioJob?.status,
      audioErrorCode: audioJob?.errorCode,
    };
  });

  const persona = thread.persona
    ? {
        ...thread.persona,
        ...clientChatModelReference(thread.persona, discovery.models),
        providerModelRecordId: undefined,
      }
    : null;

  return NextResponse.json(
    {
      thread: {
        ...thread,
        ...clientChatModelReference(thread, discovery.models),
        providerModelRecordId: undefined,
        persona,
        messages: enrichedMessages,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(
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
  const thread = await db.chatThread.findUnique({
    where: { id: threadId },
    select: { id: true, organizationId: true, createdById: true },
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

  await db.chatThread.delete({ where: { id: threadId } });
  return NextResponse.json({ success: true });
}

const updateThreadSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title cannot be empty.")
    .max(100, "Title is too long."),
});

export async function PATCH(
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
  const thread = await db.chatThread.findUnique({
    where: { id: threadId },
    select: { id: true, organizationId: true, createdById: true },
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

  try {
    const json = await request.json();
    const input = updateThreadSchema.parse(json);

    const updated = await db.chatThread.update({
      where: { id: threadId },
      data: { title: input.title },
      select: { id: true, title: true, updatedAt: true },
    });

    return NextResponse.json({ thread: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? "Invalid title" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Failed to update thread." },
      { status: 500 },
    );
  }
}
