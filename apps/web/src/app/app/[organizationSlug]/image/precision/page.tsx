import { hasOrganizationPermission } from "@aiwa/authz";
import { ImageEditor } from "@/components/studio/image-editor";
import { requireOrganizationPermission } from "@/lib/request-auth";

export default async function PrecisionImagePage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ assetId?: string; tab?: string }>;
}) {
  const { organizationSlug } = await params;
  const { assetId, tab } = await searchParams;
  const { membership } = await requireOrganizationPermission(
    organizationSlug,
    "workspace:view",
  );
  const initialMode =
    tab === "layers" || tab === "pixel" ? tab : ("ai" as const);

  return (
    <main className="relative min-h-screen min-w-0 bg-background px-4 py-7 text-foreground sm:px-7 lg:px-9 lg:py-10">
      <div className="creative-glow pointer-events-none absolute inset-0" />
      <div className="relative w-full min-w-0">
        <ImageEditor
          organizationId={membership.organizationId}
          organizationSlug={organizationSlug}
          initialAssetId={assetId}
          initialMode={initialMode}
          canEdit={hasOrganizationPermission(membership.role, "assets:manage")}
          canGenerate={hasOrganizationPermission(
            membership.role,
            "generation:create",
          )}
        />
      </div>
    </main>
  );
}
