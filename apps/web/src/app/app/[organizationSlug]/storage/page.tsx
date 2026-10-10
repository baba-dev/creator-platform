import { hasOrganizationPermission } from "@aiwa/authz";
import { AccountConnections } from "@/components/auth/account-connections";
import { parseServerEnv } from "@aiwa/config";
import { db } from "@aiwa/db";
import { requireOrganizationPermission } from "@/lib/request-auth";
import {
  StorageManager,
  type StorageConfigRow,
} from "@/components/storage/storage-manager";

export default async function StoragePage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { organizationSlug } = await params;
  const { connected, error } = await searchParams;

  const { session, membership } = await requireOrganizationPermission(
    organizationSlug,
    "workspace:view",
  );

  const organizationId = membership.organizationId;
  const canManage = hasOrganizationPermission(
    membership.role,
    "organization:manage",
  );
  const env = parseServerEnv();

  const [rawConfigs, org] = await Promise.all([
    db.externalStorageConfig.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    }),
    db.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { defaultStorageProvider: true, name: true },
    }),
  ]);

  const configs: StorageConfigRow[] = rawConfigs.map((c) => ({
    id: c.id,
    provider: c.provider,
    status: c.status,
    accountEmail: c.accountEmail,
    rootFolderName: c.rootFolderName,
    createdAt: c.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6 lg:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Connections & Storage
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage how media originals and derivatives are stored for {org.name}.
        </p>
      </div>

      <AccountConnections
        googleEnabled={Boolean(
          env.GOOGLE_AUTH_CLIENT_ID && env.GOOGLE_AUTH_CLIENT_SECRET,
        )}
        microsoftEnabled={Boolean(
          env.MICROSOFT_AUTH_CLIENT_ID && env.MICROSOFT_AUTH_CLIENT_SECRET,
        )}
        allowPasswordless={session.user.platformRole === "USER"}
        returnTo={`/app/${organizationSlug}/storage`}
      />
      <StorageManager
        key={organizationId}
        organizationId={organizationId}
        activeProvider={org.defaultStorageProvider}
        canManage={canManage}
        googleConfigured={Boolean(
          env.STORAGE_ENCRYPTION_KEY &&
          env.GOOGLE_DRIVE_CLIENT_ID &&
          env.GOOGLE_DRIVE_CLIENT_SECRET,
        )}
        oneDriveConfigured={Boolean(
          env.STORAGE_ENCRYPTION_KEY &&
          env.ONEDRIVE_CLIENT_ID &&
          env.ONEDRIVE_CLIENT_SECRET,
        )}
        configs={configs}
        connectedParam={connected}
        errorParam={error}
      />
    </div>
  );
}
