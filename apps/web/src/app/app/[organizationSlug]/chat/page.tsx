import { hasOrganizationPermission } from "@aiwa/authz";

import { CharacterChatWorkspace } from "@/components/studio/character-chat-workspace";
import { requireOrganizationPermission } from "@/lib/request-auth";
import { getAvailableStudioModels } from "@/lib/studio-model-discovery";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
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
