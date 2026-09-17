import { hasPlatformPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import {
  MemberTable,
  type MemberRow,
} from "@/components/organizations/member-table";
import { requirePlatformPermission } from "@/lib/request-auth";

export default async function Members({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const session = await requirePlatformPermission("organizations:read");
  const { organizationId } = await params;
  const [members, usage] = await Promise.all([
    db.membership.findMany({
      where: { organizationId },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      include: { user: { select: { name: true, email: true } } },
    }),
    db.asset.groupBy({
      by: ["storageOwnerUserId"],
      where: { organizationId, status: { not: "DELETED" } },
      _sum: { byteSize: true },
    }),
  ]);
  const usageByUser = new Map(
    usage.map((item) => [item.storageOwnerUserId, item._sum.byteSize ?? 0n]),
  );
  const rows: MemberRow[] = members.map((member) => ({
    id: member.id,
    userId: member.userId,
    role: member.role,
    monthlySpendingCapCredits:
      member.monthlySpendingCapCredits?.toString() ?? null,
    createdAt: member.createdAt.toISOString(),
    user: member.user,
    usedBytes: (usageByUser.get(member.userId) ?? 0n).toString(),
  }));
  return (
    <main className="px-4 py-7 sm:px-7 lg:px-9">
      <MemberTable
        members={rows}
        organizationId={organizationId}
        canManage={hasPlatformPermission(
          session.user.platformRole,
          "organizations:manage",
        )}
        canTransfer={hasPlatformPermission(
          session.user.platformRole,
          "organizations:transfer-ownership",
        )}
      />
    </main>
  );
}
