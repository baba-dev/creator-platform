import { hasPlatformPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { paymentListQuerySchema } from "@aiwa/validation";
import Link from "next/link";
import type { Route } from "next";
import { requirePlatformPermission } from "@/lib/request-auth";
import {
  formatBaisa,
  formatCredits,
  formatMuscatDate,
} from "@/lib/format-baisa";
import { RecordPaymentDialog } from "@/components/admin/payment-actions";

const PAGE_SIZE = 25;

const paymentStatuses = [
  "DRAFT",
  "PENDING",
  "CONFIRMED",
  "REJECTED",
  "REVERSED",
] as const;
const paymentMethods = ["CASH", "CHEQUE"] as const;

function PaymentStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    DRAFT: "bg-muted text-muted-foreground border-border",
    PENDING: "bg-warning/15 text-warning-foreground border-warning/30",
    CONFIRMED: "bg-success/15 text-success border-success/30",
    REJECTED: "bg-destructive/15 text-destructive border-destructive/30",
    REVERSED: "bg-muted text-muted-foreground border-border",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? "bg-muted text-muted-foreground border-border"}`}
    >
      {status}
    </span>
  );
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{
    cursor?: string;
    status?: string;
    method?: string;
  }>;
}) {
  const session = await requirePlatformPermission("payments:read");
  const { organizationId } = await params;
  const rawQuery = await searchParams;
  const parsedQuery = paymentListQuerySchema.safeParse({
    cursor: rawQuery.cursor,
    limit: PAGE_SIZE,
    status: rawQuery.status || undefined,
    method: rawQuery.method || undefined,
  });
  const query = parsedQuery.success
    ? parsedQuery.data
    : { cursor: undefined, limit: PAGE_SIZE, status: undefined, method: undefined };

  const canManage = hasPlatformPermission(
    session.user.platformRole,
    "payments:manage",
  );

  const [wallet, records] = await Promise.all([
    db.wallet.findUnique({
      where: { organizationId },
      select: { balanceCache: true },
    }),
    db.manualPayment.findMany({
      where: {
        organizationId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.method ? { method: query.method } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        method: true,
        status: true,
        amountBaisa: true,
        creditsGranted: true,
        creditsPerBaisa: true,
        receivedAt: true,
        createdAt: true,
        createdBy: { select: { name: true } },
      },
    }),
  ]);

  const rows = records.slice(0, PAGE_SIZE);
  const activeFilters = new URLSearchParams();
  if (query.status) activeFilters.set("status", query.status);
  if (query.method) activeFilters.set("method", query.method);
  const exportQuery = activeFilters.toString();
  const nextPageQuery = new URLSearchParams(activeFilters);
  if (rows.at(-1)?.id) nextPageQuery.set("cursor", rows.at(-1)!.id);

  return (
    <main className="px-4 py-7 sm:px-7 lg:px-9">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold">Payments</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Record, confirm, and audit manual OMR cash and cheque payments.{" "}
            <span className="font-annotation text-xs text-muted-foreground">
              Rates are locked at confirmation time
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`/api/admin/organizations/${organizationId}/payments/export${exportQuery ? `?${exportQuery}` : ""}`}
            download
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-card"
          >
            Export filtered CSV
          </a>
          {canManage && <RecordPaymentDialog organizationId={organizationId} />}
        </div>
      </div>

      <form
        method="get"
        className="mt-6 grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[1fr_1fr_auto_auto]"
      >
        <label className="text-xs font-semibold text-muted-foreground">
          Status
          <select
            name="status"
            defaultValue={query.status ?? ""}
            className="mt-1 min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
          >
            <option value="">All statuses</option>
            {paymentStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-muted-foreground">
          Method
          <select
            name="method"
            defaultValue={query.method ?? ""}
            className="mt-1 min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
          >
            <option value="">All methods</option>
            {paymentMethods.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="min-h-10 self-end rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          Apply filters
        </button>
        <Link
          href={`/admin/organizations/${organizationId}/payments` as Route}
          className="inline-flex min-h-10 items-center justify-center self-end rounded-md border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted"
        >
          Clear
        </Link>
      </form>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-medium text-muted-foreground">
            Current wallet balance
          </p>
          <p className="mt-2 font-display text-3xl font-semibold tabular-nums text-foreground">
            {formatCredits(wallet?.balanceCache ?? 0n)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Cached from immutable ledger entries
          </p>
        </div>
      </div>

      <div className="mt-8 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="p-4 font-medium">Method</th>
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 text-right font-medium">Amount (OMR)</th>
              <th className="p-4 text-right font-medium">Credits granted</th>
              <th className="p-4 font-medium">Recorded by</th>
              <th className="p-4 font-medium">Received (Muscat)</th>
              <th className="p-4 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/30">
                <td className="p-4 font-medium">{row.method}</td>
                <td className="p-4">
                  <PaymentStatusBadge status={row.status} />
                </td>
                <td className="p-4 text-right tabular-nums font-medium">
                  {formatBaisa(row.amountBaisa)}
                </td>
                <td className="p-4 text-right tabular-nums text-muted-foreground">
                  {row.creditsGranted !== null
                    ? formatCredits(row.creditsGranted)
                    : "—"}
                </td>
                <td className="p-4 text-muted-foreground">
                  {row.createdBy.name}
                </td>
                <td className="p-4 tabular-nums text-muted-foreground">
                  {formatMuscatDate(row.receivedAt)}
                </td>
                <td className="p-4 text-right">
                  <Link
                    href={
                      `/admin/organizations/${organizationId}/payments/${row.id}` as Route
                    }
                    className="inline-flex min-h-10 items-center font-medium text-primary hover:underline"
                  >
                    View details →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="p-10 text-center text-muted-foreground">
            No payments match the selected filters.
          </p>
        ) : null}
      </div>

      {records.length > PAGE_SIZE ? (
        <Link
          className="mt-4 inline-flex min-h-10 items-center font-semibold text-primary hover:underline"
          href={`?${nextPageQuery.toString()}` as Route}
        >
          Next page →
        </Link>
      ) : null}
    </main>
  );
}
