import { requireOrganizationPermission } from "@/lib/request-auth";
import { SpokespersonStudio } from "@/components/studio/spokesperson-studio";
import { hasOrganizationPermission } from "@aiwa/authz";

export default async function SpokespersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ assetId?: string }>;
}) {
  const { organizationSlug } = await params;
  const { assetId } = await searchParams;
  const { membership } = await requireOrganizationPermission(
    organizationSlug,
    "workspace:view",
  );

  return (
    <SpokespersonStudio
      organizationId={membership.organizationId}
      organizationSlug={organizationSlug}
      canGenerate={hasOrganizationPermission(
        membership.role,
        "generation:create",
      )}
      initialAssetId={assetId}
    />
  );
}
