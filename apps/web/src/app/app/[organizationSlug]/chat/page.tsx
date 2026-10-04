import { hasOrganizationPermission } from "@aiwa/authz";

import { CharacterChatWorkspace } from "@/components/studio/character-chat-workspace";
import { requireOrganizationPermission } from "@/lib/request-auth";
import { getAvailableStudioModels } from "@/lib/studio-model-discovery";

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ threadId?: string }>;
}) {
  const { organizationSlug } = await params;
  const { threadId } = await searchParams;
  const { membership } = await requireOrganizationPermission(
    organizationSlug,
    "workspace:view",
  );
  const canGenerate = hasOrganizationPermission(
    membership.role,
    "generation:create",
  );
  const discovery = await getAvailableStudioModels("character-chat");

  return (
    <CharacterChatWorkspace
      organizationSlug={organizationSlug}
      organizationId={membership.organizationId}
      canGenerate={canGenerate}
      initialThreadId={threadId}
      defaultModelId={discovery.defaultModelId}
      textModels={discovery.models.map((model) => ({
        id: model.id,
        providerModelId: model.providerModelId,
        name: model.name,
        provider: model.provider,
        flags: model.flags,
      }))}
    />
  );
}
