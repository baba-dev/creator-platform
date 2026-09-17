import {
  MAX_ORGANIZATION_SEATS,
  ORGANIZATION_STORAGE_QUOTA_BYTES,
} from "@aiwa/organizations";
import { db } from "@aiwa/db";
import Link from "next/link";
import { organizationSearchSchema } from "@aiwa/validation";
import { formatBinaryBytes } from "@/lib/format-bytes";
import { requirePlatformPermission } from "@/lib/request-auth";

const PAGE_SIZE = 25;

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePlatformPermission("organizations:read");
  const raw = await searchParams;
  const parsed = organizationSearchSchema.safeParse({
    search: raw.search,
    status: raw.status,
    cursor: raw.cursor,
    limit: PAGE_SIZE,
  });
  const filters = parsed.success
    ? parsed.data
    : { search: "", status: "all" as const, limit: PAGE_SIZE };
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
  const organizations = await db.organization.findMany({
    where: {
      status:
        filters.status === "all"
          ? undefined
          : (filters.status.toUpperCase() as "ACTIVE" | "SUSPENDED"),
      OR: filters.search
        ? [
            { name: { contains: filters.search } },
            { owner: { email: { contains: filters.search } } },
          ]
        : undefined,
    },
    take: PAGE_SIZE + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      createdAt: true,
      owner: { select: { name: true, email: true } },
      wallet: { select: { balanceCache: true } },
      _count: { select: { memberships: true } },
    },
  });
  const visibleIds = organizations
    .slice(0, PAGE_SIZE)
    .map((organization) => organization.id);
  const [storageGroups, jobGroups] = visibleIds.length
    ? await Promise.all([
        db.asset.groupBy({
          by: ["organizationId"],
          where: {
            organizationId: { in: visibleIds },
            status: { not: "DELETED" },
          },
          _sum: { byteSize: true },
        }),
        db.generationJob.groupBy({
          by: ["organizationId"],
          where: {
            organizationId: { in: visibleIds },
            createdAt: { gte: thirtyDaysAgo },
          },
          _count: true,
        }),
      ])
    : [[], []];
  const storageByOrganization = new Map(
    storageGroups.map((item) => [
      item.organizationId,
      item._sum.byteSize ?? 0n,
    ]),
  );
  const jobsByOrganization = new Map(
    jobGroups.map((item) => [item.organizationId, item._count]),
  );
  const hasNext = organizations.length > PAGE_SIZE;
  const rows = organizations.slice(0, PAGE_SIZE);
  return (
    <div className="px-4 py-8 sm:px-7 lg:px-9">
      <h1 className="font-display text-4xl font-semibold">Organizations</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Search, inspect, and administer customer workspaces.
      </p>
      <form className="mt-6 flex flex-wrap gap-3">
        <label className="sr-only" htmlFor="search">
          Search organizations
        </label>
        <input
          id="search"
          name="search"
          defaultValue={filters.search}
          placeholder="Organization or owner email"
          className="min-h-10 flex-1 rounded-xl border border-border bg-background px-4 text-sm"
        />
        <select
          name="status"
          defaultValue={filters.status}
          className="min-h-10 rounded-xl border border-border bg-background px-4 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <button className="min-h-10 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">
          Apply filters
        </button>
      </form>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[950px] text-left text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              {[
                "Organization",
                "Owner",
                "Seats",
                "Storage",
                "Wallet",
                "Jobs · 30d",
                "Status",
                "Created",
              ].map((x) => (
                <th className="p-4" key={x}>
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((org) => {
              const used = storageByOrganization.get(org.id) ?? 0n;
              return (
                <tr key={org.id}>
                  <td className="p-4">
                    <Link
                      className="font-semibold text-primary"
                      href={`/admin/organizations/${org.id}`}
                    >
                      {org.name}
                    </Link>
                    <div className="font-mono text-xs text-muted-foreground">
                      {org.slug}
                    </div>
                  </td>
                  <td className="p-4">
                    {org.owner.name}
                    <div className="text-xs text-muted-foreground">
                      {org.owner.email}
                    </div>
                  </td>
                  <td className="p-4 tabular-nums">
                    {org._count.memberships} / {MAX_ORGANIZATION_SEATS}
                  </td>
                  <td className="p-4 tabular-nums">
                    {formatBinaryBytes(used)} /{" "}
                    {formatBinaryBytes(ORGANIZATION_STORAGE_QUOTA_BYTES)}
                  </td>
                  <td className="p-4 tabular-nums">
                    {(org.wallet?.balanceCache ?? 0n).toLocaleString()}
                  </td>
                  <td className="p-4 tabular-nums">
                    {jobsByOrganization.get(org.id) ?? 0}
                  </td>
                  <td className="p-4">{org.status}</td>
                  <td className="p-4">
                    {org.createdAt.toLocaleDateString("en-OM")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="p-10 text-center text-muted-foreground">
            No organizations match these filters.
          </p>
        ) : null}
      </div>
      {hasNext ? (
        <Link
          className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-primary"
          href={`?search=${encodeURIComponent(filters.search)}&status=${filters.status}&cursor=${rows.at(-1)?.id}`}
        >
          Next page
        </Link>
      ) : null}
    </div>
  );
}
