import { notFound } from "next/navigation";
import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { requireOrganizationPermission } from "@/lib/request-auth";
import { CreativeConversationWorkspace } from "@/components/conversations/creative-conversation-workspace";
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

  const rawMessages = await db.chatMessage.findMany({
    where: { threadId: conversationId },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  const formattedMessages = rawMessages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    createdAt: msg.createdAt.toISOString(),
    metadata: msg.metadata as unknown as {
      turnStatus?: string;
      generationJobId?: string;
      parentGenerationId?: string | null;
      selectedAssetId?: string;
      clarification?: {
        question: string;
        options: Array<{
          label: string;
          value: string;
          assetId?: string;
          thumbnailUrl?: string;
        }>;
      };
      effectiveSpec?: Record<string, unknown>;
    } | null,
  }));

  const formattedJobs = thread.generationJobs.map((job) => ({
    id: job.id,
    status: job.status,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    providerModel: job.providerModel,
    assets: job.assets,
  }));

  return (
    <CreativeConversationWorkspace
      organizationSlug={organizationSlug}
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
