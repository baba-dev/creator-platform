import { hasOrganizationPermission } from "@aiwa/authz";
import { CreativeDirectorWorkspace } from "@/components/studio/creative-director-workspace";
import { requireOrganizationPermission } from "@/lib/request-auth";

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

  return (
    <CreativeDirectorWorkspace
      organizationSlug={organizationSlug}
      organizationId={membership.organizationId}
      canGenerate={canGenerate}
    />
  );
}
