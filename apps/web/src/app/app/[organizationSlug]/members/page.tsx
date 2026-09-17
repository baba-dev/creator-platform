import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import Link from "next/link";
import {
  MemberTable,
  type MemberRow,
} from "@/components/organizations/member-table";
import { OrganizationActions } from "@/components/organizations/organization-actions";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Brand } from "@/components/ui/brand";
import { requireOrganizationPermission } from "@/lib/request-auth";

export default async function Team({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const { membership } = await requireOrganizationPermission(
    organizationSlug,
    "members:read",
  );
  const organizationId = membership.organizationId;
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
    <main className="min-h-screen bg-background text-foreground">
      <header className="flex min-h-[72px] items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur-xl sm:px-7 lg:px-10">
        <Brand />
        <ThemeToggle />
      </header>
      <div className="px-4 py-8 sm:px-7 lg:px-10">
        <Link
          href={`/app/${organizationSlug}`}
          className="text-sm font-semibold text-primary"
        >
          ← Workspace
        </Link>
        <h1 className="font-display mt-4 text-4xl font-semibold">
          Team members
        </h1>
        <p className="mb-6 mt-2 text-sm text-muted-foreground">
          People with access to {membership.organization.name}.
        </p>
        <MemberTable
          members={rows}
          organizationId={organizationId}
          canManage={hasOrganizationPermission(
            membership.role,
            "members:manage",
          )}
        />
        <div className="mt-6">
          <OrganizationActions
            organizationId={organizationId}
            name={membership.organization.name}
            status={membership.organization.status}
            canManage={hasOrganizationPermission(
              membership.role,
              "organization:manage",
            )}
            allowStatus={false}
          />
        </div>
      </div>
    </main>
  );
}
