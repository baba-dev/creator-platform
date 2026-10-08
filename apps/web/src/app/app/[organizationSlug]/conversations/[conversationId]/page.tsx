import { notFound } from "next/navigation";
import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { requireOrganizationPermission } from "@/lib/request-auth";
import { CreativeConversationWorkspace } from "@/components/conversations/creative-conversation-workspace";
import {
  serializeChatMessage,
  serializeGenerationJob,
} from "../../../../../lib/conversations/serialization";
import type { ConversationState } from "@/lib/conversations/types";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; conversationId: string }>;
}) {
  const { organizationSlug, conversationId } = await params;

  const { membership, session } = await requireOrganizationPermission(
    organizationSlug,
    "workspace:view",
  );

  const canGenerate = hasOrganizationPermission(
    membership.role,
    "generation:create",
  );

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
    thread.organizationId !== membership.organizationId ||
    thread.createdById !== session.user.id
  ) {
    notFound();
  }

  const rawMessagesDesc = await db.chatMessage.findMany({
    where: { threadId: conversationId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const rawMessages = rawMessagesDesc.reverse();

  const formattedMessages = rawMessages.map(serializeChatMessage);
  const formattedJobs = thread.generationJobs.map(serializeGenerationJob);

  return (
    <CreativeConversationWorkspace
      organizationSlug={organizationSlug}
      organizationId={membership.organizationId}
      organizationId={membership.organizationId}
      conversationId={thread.id}
      initialTitle={thread.title}
      initialState={thread.state as unknown as ConversationState | null}
      initialMessages={formattedMessages}
      initialJobs={formattedJobs}
      canGenerate={canGenerate}
    />
  );
}
