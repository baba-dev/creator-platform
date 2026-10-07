import { hasOrganizationPermission } from "@aiwa/authz";
import { BrandStoryWorkspace } from "@/components/studio/brand-story-workspace";
import { requireOrganizationPermission } from "@/lib/request-auth";
import { getAvailableStudioModels } from "@/lib/studio-model-discovery";

export default async function BrandAssistantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { organizationSlug } = await params;
  const { tab } = await searchParams;
  const { membership } = await requireOrganizationPermission(
    organizationSlug,
    "workspace:view",
  );
  const canGenerate = hasOrganizationPermission(
    membership.role,
    "generation:create",
  );
  const [brandDiscovery, storyDiscovery] = await Promise.all([
    getAvailableStudioModels("brand-strategy"),
    getAvailableStudioModels("story-planning"),
  ]);

  return (
    <BrandStoryWorkspace
      organizationSlug={organizationSlug}
      organizationId={membership.organizationId}
      canGenerate={canGenerate}
      initialTab={tab === "story" ? "story" : "brand"}
      brandDefaultModelId={brandDiscovery.defaultModelId}
      brandModels={brandDiscovery.models}
      storyDefaultModelId={storyDiscovery.defaultModelId}
      storyModels={storyDiscovery.models}
    />
  );
}
