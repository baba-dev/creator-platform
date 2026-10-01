import { hasOrganizationPermission } from "@aiwa/authz";
import { CharacterChatWorkspace } from "@/components/studio/character-chat-workspace";
import { requireOrganizationPermission } from "@/lib/request-auth";

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

  return (
    <CharacterChatWorkspace
      organizationSlug={organizationSlug}
      organizationId={membership.organizationId}
      canGenerate={canGenerate}
    />
  );
}
