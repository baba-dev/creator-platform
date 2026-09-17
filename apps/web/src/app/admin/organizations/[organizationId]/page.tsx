import { hasPlatformPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import {
  MAX_ORGANIZATION_SEATS,
  ORGANIZATION_STORAGE_QUOTA_BYTES,
} from "@aiwa/organizations";
import { notFound } from "next/navigation";
import { OrganizationActions } from "@/components/organizations/organization-actions";
import { formatBinaryBytes } from "@/lib/format-bytes";
import { requirePlatformPermission } from "@/lib/request-auth";
export default async function Overview({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const session = await requirePlatformPermission("organizations:read");
  const { organizationId } = await params;
  const canReadPayments = hasPlatformPermission(
    session.user.platformRole,
    "payments:read",
  );
  const canReadAudit = hasPlatformPermission(
    session.user.platformRole,
    "audit:read",
  );
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    include: {
      owner: { select: { name: true, email: true } },
      wallet: true,
      memberships: true,
      assets: {
        where: { status: { not: "DELETED" } },
        select: { byteSize: true },
      },
      generationJobs: { orderBy: { createdAt: "desc" }, take: 5 },
      payments: canReadPayments
        ? { orderBy: { createdAt: "desc" }, take: 5 }
        : false,
      auditEvents: canReadAudit
        ? { orderBy: { createdAt: "desc" }, take: 5 }
        : false,
    },
  });
  if (!org) notFound();
  const used = org.assets.reduce((n, a) => n + a.byteSize, 0n);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
  const recentUsage = await db.generationJob.aggregate({
    where: { organizationId, createdAt: { gte: thirtyDaysAgo } },
    _count: true,
    _sum: { chargedCredits: true },
  });
  return (
    <main className="grid gap-5 px-4 py-7 sm:px-7 lg:grid-cols-2 lg:px-9">
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-2xl font-semibold">Overview</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Owner</dt>
            <dd>
              {org.owner.name}
              <br />
              {org.owner.email}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Seats</dt>
            <dd className="tabular-nums">
              {org.memberships.length} / {MAX_ORGANIZATION_SEATS}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Storage</dt>
            <dd className="tabular-nums">
              {formatBinaryBytes(used)} /{" "}
              {formatBinaryBytes(ORGANIZATION_STORAGE_QUOTA_BYTES)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Wallet</dt>
            <dd className="tabular-nums">
              {(org.wallet?.balanceCache ?? 0n).toLocaleString()} credits
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Jobs · last 30 days</dt>
            <dd className="tabular-nums">{recentUsage._count}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Charged · last 30 days</dt>
            <dd className="tabular-nums">
              {(recentUsage._sum.chargedCredits ?? 0n).toLocaleString()} credits
            </dd>
          </div>
        </dl>
      </section>
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-2xl font-semibold">Recent activity</h2>
        {canReadAudit && org.auditEvents.length ? (
          <ul className="mt-4 divide-y divide-border">
            {org.auditEvents.map((e) => (
              <li className="py-3 text-sm" key={e.id}>
                {e.action}
                <time className="block text-xs text-muted-foreground">
                  {e.createdAt.toLocaleString("en-OM")}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            {canReadAudit
              ? "No audit events yet."
              : "Audit events require audit permission."}
          </p>
        )}
      </section>
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-2xl font-semibold">Recent jobs</h2>
        {org.generationJobs.length ? (
          <ul className="mt-4 divide-y divide-border">
            {org.generationJobs.map((job) => (
              <li
                key={job.id}
                className="flex justify-between gap-4 py-3 text-sm"
              >
                <span>{job.status.replaceAll("_", " ")}</span>
                <span className="tabular-nums text-muted-foreground">
                  {job.chargedCredits.toLocaleString()} credits
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No jobs yet.</p>
        )}
      </section>
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-2xl font-semibold">Recent payments</h2>
        {canReadPayments && org.payments.length ? (
          <ul className="mt-4 divide-y divide-border">
            {org.payments.map((payment) => (
              <li
                key={payment.id}
                className="flex justify-between gap-4 py-3 text-sm"
              >
                <span>{payment.status}</span>
                <span className="tabular-nums text-muted-foreground">
                  {payment.amountBaisa.toLocaleString()} baisa
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            {canReadPayments
              ? "No payments yet."
              : "Payment history requires finance permission."}
          </p>
        )}
      </section>
      <OrganizationActions
        organizationId={organizationId}
        name={org.name}
        status={org.status}
        canManage={hasPlatformPermission(
          session.user.platformRole,
          "organizations:manage",
        )}
      />
    </main>
  );
}
