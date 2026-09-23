import {
  hasPlatformPermission,
  type PlatformPermission,
  type PlatformRole,
} from "@aiwa/authz";
import { db } from "@aiwa/db";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ModelActions } from "@/components/admin/model-actions";
import {
  DataTable,
  EmptyState,
  FilterBar,
  Pagination,
  StatusBadge,
} from "@/components/admin/primitives";
import { SyncModelsButton } from "@/components/admin/sync-models-button";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/creative";
import { type IconName } from "@/components/ui/icon";
import {
  parseAdminListFilters,
  type AdminListFilters,
} from "@/lib/admin-filters";
import { requirePlatformPermission } from "@/lib/request-auth";

const PAGE_SIZE = 20;
const sections = {
  organizations: {
    title: "Organizations",
    description:
      "Customer workspaces, account state, membership and generation activity.",
    permission: "organizations:read",
    icon: "projects",
  },
  users: {
    title: "Users",
    description: "Active and disabled customer and platform accounts.",
    permission: "users:read",
    icon: "admin",
  },
  payments: {
    title: "Payments",
    description: "Cash and cheque records in integer baisa, newest first.",
    permission: "payments:read",
    icon: "credits",
  },
  models: {
    title: "Model catalog",
    description: "Provider models and currently effective customer pricing.",
    permission: "models:read",
    icon: "sparkles",
  },
  jobs: {
    title: "Generation jobs",
    description:
      "Generation state, reservations, charges, and provider assignment.",
    permission: "jobs:read",
    icon: "activity",
  },
  audit: {
    title: "Audit log",
    description: "Administrative events recorded by the platform.",
    permission: "audit:read",
    icon: "assets",
  },
} as const satisfies Record<
  string,
  {
    title: string;
    description: string;
    permission: PlatformPermission;
    icon: IconName;
  }
>;

export default async function AdminSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePlatformPermission("platform:access");
  const { section: sectionName } = await params;
  const section = sections[sectionName as keyof typeof sections];
  if (
    !section ||
    !hasPlatformPermission(session.user.platformRole, section.permission)
  )
    notFound();
  const filters = parseAdminListFilters(await searchParams);

  return (
    <div className="px-4 py-7 sm:px-7 lg:px-9 lg:py-9">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow>Operations</Eyebrow>
          <h1 className="font-display mt-3 text-4xl font-semibold tracking-tight">
            {section.title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {section.description}
          </p>
        </div>
        {sectionName === "models" &&
        hasPlatformPermission(session.user.platformRole, "models:manage") ? (
          <SyncModelsButton />
        ) : null}
      </div>
      <AdminFilters section={sectionName} filters={filters} />
      <div className="mt-4 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
        {await renderSection(
          sectionName as keyof typeof sections,
          filters,
          session.user.platformRole,
        )}
      </div>
    </div>
  );
}

function AdminFilters({
  section,
  filters,
}: {
  section: string;
  filters: AdminListFilters;
}) {
  const statuses: Record<string, readonly string[]> = {
    organizations: ["ACTIVE", "SUSPENDED", "CLOSED"],
    users: ["ACTIVE", "DISABLED"],
    payments: ["DRAFT", "PENDING", "CONFIRMED", "REJECTED", "REVERSED"],
    models: ["ENABLED", "DISABLED", "MISSING_PRICE"],
    jobs: [
      "QUEUED",
      "SUBMITTED",
      "PROCESSING",
      "SUCCEEDED",
      "FAILED",
      "CANCELLED",
      "MANUAL_REVIEW",
    ],
  };
  return (
    <form action={`/admin/${section}`} method="get" className="mt-7">
      <FilterBar>
        <label className="flex-1 text-xs font-semibold">
          Search<span className="sr-only"> {section}</span>
          <input
            name="search"
            defaultValue={filters.search}
            maxLength={100}
            placeholder="Search by name or identifier"
            className="mt-1 block h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring/35"
          />
        </label>
        {statuses[section] ? (
          <label className="text-xs font-semibold">
            Status
            <select
              name="status"
              defaultValue={filters.status}
              className="mt-1 block h-10 min-w-44 rounded-xl border border-input bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring/35"
            >
              <option value="">All statuses</option>
              {statuses[section].map((status) => (
                <option key={status} value={status}>
                  {titleCase(status)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <Button type="submit" size="sm">
          Apply filters
        </Button>
      </FilterBar>
    </form>
  );
}

async function renderSection(
  section: keyof typeof sections,
  filters: AdminListFilters,
  role: PlatformRole,
) {
  const skip = (filters.page - 1) * PAGE_SIZE;
  const query = Object.fromEntries(
    Object.entries({ search: filters.search, status: filters.status }).filter(
      ([, value]) => value,
    ),
  );
  if (section === "organizations") {
    const allowed = ["ACTIVE", "SUSPENDED", "CLOSED"] as const;
    const status = allowed.find((value) => value === filters.status);
    const where = {
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search } },
              { slug: { contains: filters.search } },
            ],
          }
        : {}),
      ...(status ? { status } : {}),
    };
    const [rows, total] = await Promise.all([
      db.organization.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          wallet: { select: { balanceCache: true } },
          _count: { select: { memberships: true, generationJobs: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: PAGE_SIZE,
      }),
      db.organization.count({ where }),
    ]);
    return (
      <ListResult
        section={section}
        icon="projects"
        page={filters.page}
        total={total}
        query={query}
      >
        <DataTable label="Organizations">
          <TableHead
            labels={["Organization", "Members", "Jobs", "Credits", "Status"]}
          />
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id}>
                <Cell>
                  <strong>{row.name}</strong>
                  <Meta>{row.slug}</Meta>
                </Cell>
                <Cell>{row._count.memberships}</Cell>
                <Cell>{row._count.generationJobs}</Cell>
                <NumericCell>
                  {formatBigInt(row.wallet?.balanceCache ?? 0n)}
                </NumericCell>
                <Cell>
                  <StatusBadge tone={statusTone(row.status)}>
                    {titleCase(row.status)}
                  </StatusBadge>
                </Cell>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </ListResult>
    );
  }
  if (section === "users") {
    const disabled =
      filters.status === "DISABLED"
        ? { not: null }
        : filters.status === "ACTIVE"
          ? null
          : undefined;
    const where = {
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search } },
              { email: { contains: filters.search } },
            ],
          }
        : {}),
      ...(disabled !== undefined ? { disabledAt: disabled } : {}),
    };
    const [rows, total] = await Promise.all([
      db.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          platformRole: true,
          disabledAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: PAGE_SIZE,
      }),
      db.user.count({ where }),
    ]);
    return (
      <ListResult
        section={section}
        icon="admin"
        page={filters.page}
        total={total}
        query={query}
      >
        <DataTable label="Users">
          <TableHead labels={["User", "Role", "Joined", "Status"]} />
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id}>
                <Cell>
                  <strong>{row.name}</strong>
                  <Meta>{row.email}</Meta>
                </Cell>
                <Cell>{titleCase(row.platformRole)}</Cell>
                <Cell>{formatDate(row.createdAt)}</Cell>
                <Cell>
                  <StatusBadge tone={row.disabledAt ? "warning" : "success"}>
                    {row.disabledAt ? "Disabled" : "Active"}
                  </StatusBadge>
                </Cell>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </ListResult>
    );
  }
  if (section === "payments") {
    const allowed = [
      "DRAFT",
      "PENDING",
      "CONFIRMED",
      "REJECTED",
      "REVERSED",
    ] as const;
    const status = allowed.find((value) => value === filters.status);
    const where = {
      ...(filters.search
        ? {
            OR: [
              { reference: { contains: filters.search } },
              { chequeNumber: { contains: filters.search } },
              { organization: { name: { contains: filters.search } } },
            ],
          }
        : {}),
      ...(status ? { status } : {}),
    };
    const [rows, total] = await Promise.all([
      db.manualPayment.findMany({
        where,
        select: {
          id: true,
          method: true,
          status: true,
          amountBaisa: true,
          receivedAt: true,
          organization: { select: { name: true } },
        },
        orderBy: { receivedAt: "desc" },
        skip,
        take: PAGE_SIZE,
      }),
      db.manualPayment.count({ where }),
    ]);
    return (
      <ListResult
        section={section}
        icon="credits"
        page={filters.page}
        total={total}
        query={query}
      >
        <DataTable label="Payments">
          <TableHead
            labels={[
              "Organization",
              "Method",
              "Received",
              "Amount (OMR)",
              "Status",
            ]}
          />
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id}>
                <Cell>
                  <strong>{row.organization.name}</strong>
                </Cell>
                <Cell>{titleCase(row.method)}</Cell>
                <Cell>{formatDate(row.receivedAt)}</Cell>
                <NumericCell>{formatBaisa(row.amountBaisa)}</NumericCell>
                <Cell>
                  <StatusBadge tone={statusTone(row.status)}>
                    {titleCase(row.status)}
                  </StatusBadge>
                </Cell>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </ListResult>
    );
  }
  if (section === "models") {
    const now = new Date();
    const enabled =
      filters.status === "ENABLED"
        ? true
        : filters.status === "DISABLED"
          ? false
          : undefined;
    const missingPrice = filters.status === "MISSING_PRICE";
    const where = {
      ...(filters.search
        ? {
            OR: [
              { displayName: { contains: filters.search } },
              { providerModelId: { contains: filters.search } },
            ],
          }
        : {}),
      ...(enabled !== undefined ? { enabled } : {}),
      ...(missingPrice
        ? {
            enabled: true,
            priceVersions: {
              none: {
                effectiveFrom: { lte: now },
                OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
              },
            },
          }
        : {}),
    };
    const priceWhere = {
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    };
    const canManage = hasPlatformPermission(role, "models:manage");
    const [rows, total] = await Promise.all([
      db.providerModel.findMany({
        where,
        select: {
          id: true,
          displayName: true,
          providerModelId: true,
          description: true,
          provider: true,
          mediaKind: true,
          enabled: true,
          priceVersions: {
            where: priceWhere,
            select: {
              customerCredits: true,
              providerCostMicroUsd: true,
              targetMarginBps: true,
              pricingDimension: true,
              unitQuantity: true,
            },
            orderBy: { effectiveFrom: "desc" },
            take: 1,
          },
        },
        orderBy: { displayName: "asc" },
        skip,
        take: PAGE_SIZE,
      }),
      db.providerModel.count({ where }),
    ]);
    return (
      <ListResult
        section={section}
        icon="sparkles"
        page={filters.page}
        total={total}
        query={query}
      >
        <DataTable label="Model catalog">
          <TableHead
            labels={[
              "Model",
              "Provider",
              "Kind",
              "Customer credits",
              "Provider micro-USD",
              "Status",
              ...(canManage ? ["Actions"] : []),
            ]}
          />
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const price = row.priceVersions[0];
              return (
                <tr key={row.id}>
                  <Cell>
                    <strong>{row.displayName}</strong>
                    <Meta>{row.providerModelId}</Meta>
                    <p
                      className="mt-1 max-w-[200px] truncate text-[10px] text-muted-foreground"
                      title={row.description}
                    >
                      {row.description}
                    </p>
                  </Cell>
                  <Cell>{titleCase(row.provider)}</Cell>
                  <Cell>{titleCase(row.mediaKind)}</Cell>
                  <NumericCell>
                    {price ? formatBigInt(price.customerCredits) : "—"}
                  </NumericCell>
                  <NumericCell>
                    {price ? formatBigInt(price.providerCostMicroUsd) : "—"}
                  </NumericCell>
                  <Cell>
                    <StatusBadge
                      tone={
                        !row.enabled ? "neutral" : price ? "success" : "warning"
                      }
                    >
                      {!row.enabled
                        ? "Disabled"
                        : price
                          ? "Priced"
                          : "Missing price"}
                    </StatusBadge>
                  </Cell>
                  {canManage ? (
                    <Cell>
                      <ModelActions
                        modelId={row.id}
                        displayName={row.displayName}
                        enabled={row.enabled}
                        currentProviderCostMicroUsd={price?.providerCostMicroUsd.toString()}
                        currentCustomerCredits={price?.customerCredits.toString()}
                        currentTargetMarginBps={price?.targetMarginBps}
                        currentPricingDimension={price?.pricingDimension}
                        currentUnitQuantity={price?.unitQuantity}
                        canManage={canManage}
                        mediaKind={row.mediaKind}
                      />
                    </Cell>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </ListResult>
    );
  }
  if (section === "jobs") {
    const allowed = [
      "QUEUED",
      "SUBMITTED",
      "PROCESSING",
      "SUCCEEDED",
      "FAILED",
      "CANCELLED",
      "MANUAL_REVIEW",
    ] as const;
    const status = allowed.find((value) => value === filters.status);
    const where = {
      ...(filters.search
        ? {
            OR: [
              { id: { contains: filters.search } },
              { providerRequestId: { contains: filters.search } },
              { organization: { name: { contains: filters.search } } },
            ],
          }
        : {}),
      ...(status ? { status } : {}),
    };
    const [rows, total] = await Promise.all([
      db.generationJob.findMany({
        where,
        select: {
          id: true,
          status: true,
          reservedCredits: true,
          chargedCredits: true,
          createdAt: true,
          organization: { select: { name: true } },
          providerModel: { select: { displayName: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: PAGE_SIZE,
      }),
      db.generationJob.count({ where }),
    ]);
    return (
      <ListResult
        section={section}
        icon="activity"
        page={filters.page}
        total={total}
        query={query}
      >
        <DataTable label="Generation jobs">
          <TableHead
            labels={[
              "Job",
              "Organization",
              "Model",
              "Reserved",
              "Charged",
              "Status",
              "Action",
            ]}
          />
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id}>
                <Cell>
                  <Link
                    href={`/admin/jobs/${row.id}`}
                    className="font-mono font-semibold text-primary hover:underline"
                  >
                    {shortId(row.id)}
                  </Link>
                  <Meta>{formatDate(row.createdAt)}</Meta>
                </Cell>
                <Cell>{row.organization.name}</Cell>
                <Cell>{row.providerModel.displayName}</Cell>
                <NumericCell>{formatBigInt(row.reservedCredits)}</NumericCell>
                <NumericCell>{formatBigInt(row.chargedCredits)}</NumericCell>
                <Cell>
                  <StatusBadge tone={statusTone(row.status)}>
                    {titleCase(row.status)}
                  </StatusBadge>
                </Cell>
                <Cell>
                  <Link
                    href={`/admin/jobs/${row.id}`}
                    className="inline-flex min-h-8 items-center text-xs font-semibold text-primary hover:underline"
                  >
                    {row.status === "MANUAL_REVIEW"
                      ? "Reconcile →"
                      : "Details →"}
                  </Link>
                </Cell>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </ListResult>
    );
  }
  const where = filters.search
    ? {
        OR: [
          { action: { contains: filters.search } },
          { targetType: { contains: filters.search } },
        ],
      }
    : {};
  const [rows, total] = await Promise.all([
    db.auditEvent.findMany({
      where,
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        createdAt: true,
        actor: { select: { name: true } },
        organization: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
    }),
    db.auditEvent.count({ where }),
  ]);
  return (
    <ListResult
      section={section}
      icon="assets"
      page={filters.page}
      total={total}
      query={query}
    >
      <DataTable label="Audit events">
        <TableHead
          labels={["Action", "Target", "Actor", "Organization", "Recorded"]}
        />
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.id}>
              <Cell>
                <strong>{row.action}</strong>
              </Cell>
              <Cell>
                {row.targetType}
                <Meta>{row.targetId ? shortId(row.targetId) : "—"}</Meta>
              </Cell>
              <Cell>{row.actor?.name ?? "System"}</Cell>
              <Cell>{row.organization?.name ?? "Platform"}</Cell>
              <Cell>{formatDate(row.createdAt)}</Cell>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </ListResult>
  );
}

function ListResult({
  section,
  icon,
  page,
  total,
  query,
  children,
}: {
  section: string;
  icon: IconName;
  page: number;
  total: number;
  query: Record<string, string>;
  children: React.ReactNode;
}) {
  if (!total)
    return (
      <EmptyState
        icon={icon}
        title="No records match these filters"
        description="Clear or adjust the filters and try again."
      />
    );
  return (
    <>
      {children}
      <div className="mt-4">
        <Pagination
          page={page}
          hasNext={page * PAGE_SIZE < total}
          basePath={`/admin/${section}`}
          query={query}
        />
      </div>
    </>
  );
}
function TableHead({ labels }: { labels: readonly string[] }) {
  return (
    <thead>
      <tr className="border-b border-border text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {labels.map((label, index) => (
          <th
            key={label}
            className={`pb-3 ${index >= labels.length - 3 ? "text-right" : ""}`}
          >
            {label}
          </th>
        ))}
      </tr>
    </thead>
  );
}
function Cell({ children }: { children: React.ReactNode }) {
  return (
    <td className="py-4 pr-4 text-xs text-muted-foreground">{children}</td>
  );
}
function NumericCell({ children }: { children: React.ReactNode }) {
  return (
    <td className="py-4 pr-4 text-right font-mono text-xs font-semibold tabular-nums">
      {children}
    </td>
  );
}
function Meta({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-1 block font-mono text-[9px] text-muted-foreground">
      {children}
    </span>
  );
}
function titleCase(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase().replaceAll("_", " ");
}
function formatBigInt(value: bigint) {
  return value.toLocaleString("en-US");
}
function formatBaisa(value: bigint) {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 1000n}.${(absolute % 1000n).toString().padStart(3, "0")}`;
}
function formatDate(value: Date) {
  return value.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}
function shortId(value: string) {
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}
function statusTone(
  status: string,
): "neutral" | "info" | "success" | "warning" | "danger" {
  if (["ACTIVE", "CONFIRMED", "SUCCEEDED"].includes(status)) return "success";
  if (["PENDING", "MANUAL_REVIEW", "SUSPENDED"].includes(status))
    return "warning";
  if (["FAILED", "REJECTED"].includes(status)) return "danger";
  if (["PROCESSING", "SUBMITTED", "QUEUED"].includes(status)) return "info";
  return "neutral";
}
