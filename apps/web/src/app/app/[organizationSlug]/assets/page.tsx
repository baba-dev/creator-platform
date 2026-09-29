import Link from "next/link";
import { hasOrganizationPermission } from "@aiwa/authz";
import { DEFAULT_ORGANIZATION_STORAGE_QUOTA_BYTES } from "@aiwa/assets";
import { db } from "@aiwa/db";

import { AssetLibrary } from "@/components/assets/asset-library";
import { requireOrganizationPermission } from "@/lib/request-auth";

export default async function AssetLibraryPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const { membership } = await requireOrganizationPermission(
    organizationSlug,
    "assets:read",
  );
  const organizationId = membership.organization.id;
  const [projects, folders, tags, usage] = await Promise.all([
    db.project.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.assetFolder.findMany({
      where: { organizationId },
      orderBy: [{ parentId: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        parentId: true,
        _count: { select: { assets: true } },
      },
    }),
    db.assetTag.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        _count: { select: { assignments: true } },
      },
    }),
    db.assetStorageUsage.findUnique({
      where: { organizationId },
      select: { usedBytes: true, reservedBytes: true },
    }),
  ]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="creative-glow pointer-events-none fixed inset-0" />
      <div className="relative mx-auto max-w-[1800px] px-4 py-7 sm:px-7 lg:px-9 lg:py-10">
        <Link
          href={`/app/${organizationSlug}`}
          className="mb-4 inline-flex min-h-10 items-center text-sm font-semibold text-primary"
        >
          ← Workspace
        </Link>
        <AssetLibrary
          organizationId={organizationId}
          canManage={hasOrganizationPermission(
            membership.role,
            "assets:manage",
          )}
          projects={projects}
          initialFolders={folders}
          initialTags={tags}
          storageUsedBytes={(
            (usage?.usedBytes ?? 0n) + (usage?.reservedBytes ?? 0n)
          ).toString()}
          storageQuotaBytes={DEFAULT_ORGANIZATION_STORAGE_QUOTA_BYTES.toString()}
        />
      </div>
    </main>
  );
}
