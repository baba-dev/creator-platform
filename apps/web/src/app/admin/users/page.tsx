import { hasPlatformPermission, type PlatformRole } from "@aiwa/authz";
import { db } from "@aiwa/db";
import Link from "next/link";
import type { Route } from "next";
import {
  DataTable,
  EmptyState,
  FilterBar,
  Pagination,
  StatusBadge,
} from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/creative";
import { requirePlatformPermission } from "@/lib/request-auth";

const PAGE_SIZE = 20;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePlatformPermission("users:read");
  const rawParams = await searchParams;

  const search =
    typeof rawParams.search === "string" ? rawParams.search.trim() : "";
  const status =
    typeof rawParams.status === "string" ? rawParams.status.trim() : "";
  const role = typeof rawParams.role === "string" ? rawParams.role.trim() : "";
  const requestedPage = Number.parseInt(
    typeof rawParams.page === "string" ? rawParams.page : "1",
    10,
  );
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;

  const skip = (page - 1) * PAGE_SIZE;

  const disabledFilter =
    status === "DISABLED"
      ? { not: null }
      : status === "ACTIVE"
        ? null
        : undefined;

  const roleFilter = [
    "USER",
    "SUPPORT",
    "OPERATOR",
    "FINANCE_ADMIN",
    "PLATFORM_ADMIN",
    "PLATFORM_OWNER",
  ].includes(role)
    ? (role as PlatformRole)
    : undefined;

  const where = {
    ...(search
      ? {
          OR: [{ name: { contains: search } }, { email: { contains: search } }],
        }
      : {}),
    ...(disabledFilter !== undefined ? { disabledAt: disabledFilter } : {}),
    ...(roleFilter ? { platformRole: roleFilter } : {}),
  };

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        platformRole: true,
        disabledAt: true,
        createdAt: true,
        _count: {
          select: {
            memberships: true,
            sessions: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
    }),
    db.user.count({ where }),
  ]);

  const queryParams: Record<string, string> = {};
  if (search) queryParams.search = search;
  if (status) queryParams.status = status;
  if (role) queryParams.role = role;

  const canManageUsers = hasPlatformPermission(
    session.user.platformRole,
    "users:manage",
  );

  return (
    <div className="px-4 py-7 sm:px-7 lg:px-9 lg:py-9">
      <Eyebrow>Operations</Eyebrow>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-tight">
            Users
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Customer and platform accounts, memberships, and operational access.
          </p>
        </div>
      </div>

      <form action="/admin/users" method="get" className="mt-6">
        <FilterBar>
          <label className="flex-1 text-xs font-semibold">
            Search users
            <input
              name="search"
              defaultValue={search}
              maxLength={100}
              placeholder="Search by name or email"
              className="mt-1 block h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring/35"
            />
          </label>
          <label className="text-xs font-semibold">
            Status
            <select
              name="status"
              defaultValue={status}
              className="mt-1 block h-10 min-w-36 rounded-xl border border-input bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring/35"
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="DISABLED">Disabled</option>
            </select>
          </label>
          <label className="text-xs font-semibold">
            Platform role
            <select
              name="role"
              defaultValue={role}
              className="mt-1 block h-10 min-w-44 rounded-xl border border-input bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring/35"
            >
              <option value="">All roles</option>
              <option value="USER">User</option>
              <option value="SUPPORT">Support</option>
              <option value="OPERATOR">Operator</option>
              <option value="FINANCE_ADMIN">Finance Admin</option>
              <option value="PLATFORM_ADMIN">Platform Admin</option>
              <option value="PLATFORM_OWNER">Platform Owner</option>
            </select>
          </label>
          <Button type="submit" size="sm" className="min-h-10">
            Apply filters
          </Button>
        </FilterBar>
      </form>

      <div className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
        {total === 0 ? (
          <EmptyState
            icon="admin"
            title="No users found"
            description="No user accounts match these filter criteria. Try clearing search or status filters."
          />
        ) : (
          <>
            <DataTable label="Users">
              <thead>
                <tr className="border-b border-border text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="pb-3 pr-4">User</th>
                  <th className="pb-3 pr-4">Platform role</th>
                  <th className="pb-3 pr-4 text-center">Organizations</th>
                  <th className="pb-3 pr-4 text-center">Active sessions</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 pr-4">Joined</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((user) => (
                  <tr key={user.id} className="text-xs">
                    <td className="py-4 pr-4">
                      <Link
                        href={`/admin/users/${user.id}` as Route}
                        className="font-semibold text-foreground hover:text-primary"
                      >
                        {user.name}
                      </Link>
                      <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                        {user.email}
                      </span>
                    </td>
                    <td className="py-4 pr-4">
                      <span className="inline-block rounded-lg border border-border bg-muted/60 px-2 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
                        {user.platformRole.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="py-4 pr-4 text-center font-mono font-semibold tabular-nums text-muted-foreground">
                      {user._count.memberships}
                    </td>
                    <td className="py-4 pr-4 text-center font-mono font-semibold tabular-nums text-muted-foreground">
                      {user._count.sessions}
                    </td>
                    <td className="py-4 pr-4">
                      <StatusBadge
                        tone={user.disabledAt ? "warning" : "success"}
                      >
                        {user.disabledAt ? "Disabled" : "Active"}
                      </StatusBadge>
                    </td>
                    <td className="py-4 pr-4 font-mono text-[10px] tabular-nums text-muted-foreground">
                      {user.createdAt.toLocaleDateString("en-OM", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-4 text-right">
                      <Button
                        asChild
                        variant="secondary"
                        size="sm"
                        className="min-h-10 min-w-10"
                      >
                        <Link href={`/admin/users/${user.id}` as Route}>
                          {canManageUsers ? "Manage" : "View"}
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <div className="mt-4">
              <Pagination
                page={page}
                hasNext={page * PAGE_SIZE < total}
                basePath="/admin/users"
                query={queryParams}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
