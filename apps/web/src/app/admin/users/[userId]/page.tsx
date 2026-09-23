import { hasPlatformPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import {
  MEMBER_STORAGE_QUOTA_BYTES,
  getStorageUsage,
} from "@aiwa/organizations";
import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import {
  AttachOrganizationForm,
  RemoveMembershipButton,
  UserAccessActions,
  UserPlatformRoleForm,
} from "@/components/admin/user-actions";
import { StatusBadge } from "@/components/admin/primitives";
import { formatBinaryBytes } from "@/lib/format-bytes";
import { requirePlatformPermission } from "@/lib/request-auth";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const session = await requirePlatformPermission("users:read");
  const { userId } = await params;

  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        include: {
          organization: {
            select: { id: true, name: true, slug: true, status: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      sessions: {
        where: { expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        include: {
          activeOrganization: {
            select: { name: true, slug: true },
          },
        },
      },
    },
  });

  if (!user) notFound();

  // Fetch storage usage for each organization membership
  const membershipsWithStorage = await Promise.all(
    user.memberships.map(async (m) => {
      const usedBytes = await getStorageUsage(m.organizationId, user.id);
      return { ...m, usedBytes };
    }),
  );

  // Fetch relevant audit events (user as target or actor)
  const canReadAudit = hasPlatformPermission(
    session.user.platformRole,
    "audit:read",
  );
  const auditEvents = canReadAudit
    ? await db.auditEvent.findMany({
        where: {
          OR: [
            { targetType: "User", targetId: user.id },
            { actorUserId: user.id },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          actor: { select: { name: true, email: true } },
          organization: { select: { name: true, slug: true } },
        },
      })
    : [];

  // Active organizations user is NOT yet a member of
  const currentOrgIds = user.memberships.map((m) => m.organizationId);
  const availableOrganizations = await db.organization.findMany({
    where: {
      status: "ACTIVE",
      id: { notIn: currentOrgIds.length ? currentOrgIds : ["__none__"] },
    },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
    take: 50,
  });

  const isSelf = session.user.id === user.id;
  const isPlatformOwner = session.user.platformRole === "PLATFORM_OWNER";
  const canManageUsers = hasPlatformPermission(
    session.user.platformRole,
    "users:manage",
  );
  const canManageOrganizations = hasPlatformPermission(
    session.user.platformRole,
    "organizations:manage",
  );

  return (
    <div className="px-4 py-7 sm:px-7 lg:px-9 lg:py-9">
      <nav aria-label="Breadcrumb">
        <Link
          href={"/admin/users" as Route}
          className="inline-flex min-h-10 items-center text-sm font-semibold text-primary hover:underline"
        >
          ← Users
        </Link>
      </nav>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {user.name}
            </h1>
            <StatusBadge tone={user.disabledAt ? "warning" : "success"}>
              {user.disabledAt ? "Disabled" : "Active"}
            </StatusBadge>
            <span className="rounded-full border border-border bg-muted/60 px-3 py-1 font-mono text-xs font-semibold text-muted-foreground">
              {user.platformRole.replaceAll("_", " ")}
            </span>
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {user.email} · ID: {user.id}
          </p>
        </div>
      </div>

      <div className="mt-7 grid gap-6 lg:grid-cols-2">
        {/* Left Column: Account Details & Permissions */}
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-xl font-semibold">
              Account overview
            </h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Email address</dt>
                <dd className="mt-0.5 font-mono text-xs font-medium">
                  {user.email}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  Email verified
                </dt>
                <dd className="mt-0.5">
                  <StatusBadge
                    tone={user.emailVerified ? "success" : "neutral"}
                  >
                    {user.emailVerified ? "Verified" : "Unverified"}
                  </StatusBadge>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">MFA status</dt>
                <dd className="mt-0.5">
                  <StatusBadge
                    tone={user.twoFactorEnabled ? "success" : "neutral"}
                  >
                    {user.twoFactorEnabled ? "Active" : "Not enabled"}
                  </StatusBadge>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Created at</dt>
                <dd className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                  {user.createdAt.toLocaleDateString("en-OM", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Last updated</dt>
                <dd className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                  {user.updatedAt.toLocaleDateString("en-OM", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </dd>
              </div>
            </dl>
          </section>

          {/* Platform Role Management */}
          <UserPlatformRoleForm
            userId={user.id}
            currentRole={user.platformRole}
            isPlatformOwner={isPlatformOwner}
          />

          {/* Access and Sessions Actions */}
          <UserAccessActions
            userId={user.id}
            userName={user.name}
            isDisabled={Boolean(user.disabledAt)}
            isEmailVerified={user.emailVerified}
            isSelf={isSelf}
            canManage={canManageUsers}
          />

          {/* Active Sessions List */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">
                Active sessions
              </h2>
              <span className="font-mono text-xs text-muted-foreground">
                {user.sessions.length} active
              </span>
            </div>
            {user.sessions.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                No active device sessions found for this user.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {user.sessions.map((s) => (
                  <li key={s.id} className="py-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold">
                        {s.ipAddress ?? "Unknown IP"}
                      </span>
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                        Expires{" "}
                        {s.expiresAt.toLocaleDateString("en-OM", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                    </div>
                    <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                      {s.userAgent ?? "Unknown device client"}
                    </p>
                    {s.activeOrganization ? (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        Active in:{" "}
                        <span className="font-medium text-foreground">
                          {s.activeOrganization.name}
                        </span>
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Right Column: Organization Memberships & Audit History */}
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold">
                Organization memberships
              </h2>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {user.memberships.length} organizations
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Workspaces this user can access, roles, and storage quotas.
            </p>

            {membershipsWithStorage.length === 0 ? (
              <p className="mt-4 text-xs text-muted-foreground">
                This user is not currently attached to any organizations.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    <tr>
                      <th className="pb-2">Organization</th>
                      <th className="pb-2">Role</th>
                      <th className="pb-2">Monthly cap</th>
                      <th className="pb-2">Storage</th>
                      <th className="pb-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {membershipsWithStorage.map((m) => {
                      const isOwner = m.role === "ORGANIZATION_OWNER";
                      return (
                        <tr key={m.id}>
                          <td className="py-3 pr-2">
                            <Link
                              href={
                                `/admin/organizations/${m.organizationId}` as Route
                              }
                              className="font-semibold text-primary hover:underline"
                            >
                              {m.organization.name}
                            </Link>
                            <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                              {m.organization.slug}
                            </span>
                          </td>
                          <td className="py-3 pr-2">
                            <span className="font-medium">
                              {m.role.replace("ORGANIZATION_", "")}
                            </span>
                          </td>
                          <td className="py-3 pr-2 font-mono tabular-nums text-muted-foreground">
                            {isOwner
                              ? "Owner"
                              : m.monthlySpendingCapCredits
                                ? `${BigInt(m.monthlySpendingCapCredits).toLocaleString()} cr`
                                : "Unlimited"}
                          </td>
                          <td className="py-3 pr-2 font-mono tabular-nums text-muted-foreground">
                            {formatBinaryBytes(m.usedBytes)} /{" "}
                            {formatBinaryBytes(MEMBER_STORAGE_QUOTA_BYTES)}
                          </td>
                          <td className="py-3 text-right">
                            <RemoveMembershipButton
                              organizationId={m.organizationId}
                              membershipId={m.id}
                              isOwner={isOwner}
                              canManage={canManageOrganizations}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Attach User to an Organization Form */}
            <AttachOrganizationForm
              userId={user.id}
              organizations={availableOrganizations}
              canManage={canManageOrganizations}
            />
          </section>

          {/* Audit History Card */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-xl font-semibold">
              Relevant audit history
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Administrative actions where this user was the actor or target.
            </p>

            {auditEvents.length === 0 ? (
              <p className="mt-4 text-xs text-muted-foreground">
                {canReadAudit
                  ? "No audit events recorded for this user."
                  : "Audit event inspection requires audit:read permission."}
              </p>
            ) : (
              <ol className="mt-4 divide-y divide-border">
                {auditEvents.map((evt) => (
                  <li key={evt.id} className="py-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{evt.action}</span>
                      <time
                        className="font-mono text-[10px] tabular-nums text-muted-foreground"
                        dateTime={evt.createdAt.toISOString()}
                      >
                        {evt.createdAt.toLocaleDateString("en-OM", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Actor: {evt.actor?.name ?? "System"} · Target:{" "}
                      {evt.targetType} ({evt.targetId ?? "—"})
                    </p>
                    {evt.organization ? (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        Organization: {evt.organization.name}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
