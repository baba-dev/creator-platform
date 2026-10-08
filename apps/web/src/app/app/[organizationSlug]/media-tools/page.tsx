import { MediaKitStudio } from "@/components/studio/mediakit-studio";
import { requireOrganizationPermission } from "@/lib/request-auth";
import { hasOrganizationPermission } from "@aiwa/authz";

export default async function MediaKitPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const { membership } = await requireOrganizationPermission(
    organizationSlug,
    "workspace:view",
  );
  return (
    <MediaKitStudio
      organizationId={membership.organizationId}
      organizationSlug={organizationSlug}
      canGenerate={hasOrganizationPermission(
        membership.role,
        "generation:create",
      )}
    />
  );
}
