import { hasOrganizationPermission } from "@aiwa/authz";
import { ScriptwritingStudio } from "@/components/studio/scriptwriting-studio";
import { requireOrganizationPermission } from "@/lib/request-auth";
import { getAvailableStudioModels } from "@/lib/studio-model-discovery";

export default async function ScriptsPage({
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
  const discovery = await getAvailableStudioModels("scriptwriting");

  return (
    <ScriptwritingStudio
      organizationSlug={organizationSlug}
      organizationId={membership.organizationId}
      canGenerate={canGenerate}
      defaultModelId={discovery.defaultModelId}
      textModels={discovery.models}
    />
  );
}
