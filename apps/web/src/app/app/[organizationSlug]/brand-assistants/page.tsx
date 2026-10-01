import { hasOrganizationPermission } from "@aiwa/authz";
import { BrandStoryWorkspace } from "@/components/studio/brand-story-workspace";
import { requireOrganizationPermission } from "@/lib/request-auth";

export default async function BrandAssistantsPage({
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
    <BrandStoryWorkspace
      organizationSlug={organizationSlug}
      organizationId={membership.organizationId}
      canGenerate={canGenerate}
    />
  );
}
