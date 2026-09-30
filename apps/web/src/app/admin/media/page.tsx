import { hasPlatformPermission } from "@aiwa/authz";
import { requirePlatformPermission } from "@/lib/request-auth";
import { mediaOperationsSnapshot } from "@/lib/media-operations";
import { MediaOperations } from "@/components/admin/media-operations";
export default async function MediaOperationsPage() {
  const session = await requirePlatformPermission("jobs:read");
  return (
    <MediaOperations
      initial={await mediaOperationsSnapshot()}
      canManage={hasPlatformPermission(
        session.user.platformRole,
        "jobs:manage",
      )}
    />
  );
}
