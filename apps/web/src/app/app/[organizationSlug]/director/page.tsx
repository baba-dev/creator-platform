import { hasOrganizationPermission } from "@aiwa/authz";
import { CreativeDirectorWorkspace } from "@/components/studio/creative-director-workspace";
import { requireOrganizationPermission } from "@/lib/request-auth";
import { getAvailableStudioModels } from "@/lib/studio-model-discovery";

export default async function DirectorPage({
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
  const discovery = await getAvailableStudioModels("creative-director");

  return (
    <CreativeDirectorWorkspace
      organizationSlug={organizationSlug}
      organizationId={membership.organizationId}
      canGenerate={canGenerate}
      defaultModelId={discovery.defaultModelId}
      textModels={discovery.models}
    />
  );
}
