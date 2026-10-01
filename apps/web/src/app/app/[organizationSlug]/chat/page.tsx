import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
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
  const now = new Date();
  const textModels = await db.providerModel.findMany({
    where: {
      provider: "BYTEPLUS",
      mediaKind: "TEXT",
      enabled: true,
      priceVersions: {
        some: {
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
      },
    },
    select: {
      providerModelId: true,
      displayName: true,
    },
    orderBy: { displayName: "asc" },
  });

  return (
    <CharacterChatWorkspace
      organizationSlug={organizationSlug}
      organizationId={membership.organizationId}
      canGenerate={canGenerate}
      textModels={textModels.map((model) => ({
        id: model.providerModelId,
        name: model.displayName,
      }))}
    />
  );
}
