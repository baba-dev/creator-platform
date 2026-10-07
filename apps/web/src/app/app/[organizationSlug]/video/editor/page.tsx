import { hasOrganizationPermission } from "@aiwa/authz";
import { VideoEditor } from "@/components/studio/video-editor";
import { requireOrganizationPermission } from "@/lib/request-auth";

export default async function VideoEditingPage({
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
    <main className="relative min-h-screen min-w-0 bg-background px-4 py-7 text-foreground sm:px-7 lg:px-9 lg:py-10">
      <div className="creative-glow pointer-events-none absolute inset-0" />
      <div className="relative w-full min-w-0">
        <VideoEditor
          organizationId={membership.organizationId}
          initialAssetId={assetId}
          canEdit={hasOrganizationPermission(membership.role, "assets:manage")}
        />
      </div>
    </main>
  );
}
