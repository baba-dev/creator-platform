import { hasPlatformPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import Link from "next/link";
import type { Route } from "next";
import { requirePlatformPermission } from "@/lib/request-auth";
import { formatCredits } from "@/lib/format-baisa";
import { GrantCreditsDialog } from "@/components/admin/payment-actions";

const PAGE_SIZE = 25;

function LedgerTypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    PAYMENT_GRANT: "bg-success/15 text-success border-success/30",
    ADMIN_GRANT: "bg-success/15 text-success border-success/30",
    RESERVATION: "bg-muted text-muted-foreground border-border",
    CAPTURE: "bg-muted text-muted-foreground border-border",
    RELEASE: "bg-warning/15 text-warning-foreground border-warning/30",
    REFUND: "bg-warning/15 text-warning-foreground border-warning/30",
    REVERSAL: "bg-destructive/15 text-destructive border-destructive/30",
    ADJUSTMENT: "bg-info/15 text-info-foreground border-info/30",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[type] ?? "bg-muted text-muted-foreground border-border"}`}
    >
      {type}
    </span>
  );
}

function isPositiveEntry(type: string): boolean {
  return (
    type === "PAYMENT_GRANT" ||
    type === "ADMIN_GRANT" ||
    type === "RELEASE" ||
    type === "REFUND"
  );
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const session = await requirePlatformPermission("payments:read");
  const { organizationId } = await params;
  const { cursor } = await searchParams;

  const canGrant = hasPlatformPermission(
    session.user.platformRole,
    "credits:grant",
  );

  const wallet = await db.wallet.findUnique({
    where: { organizationId },
    include: {
      entries: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: PAGE_SIZE + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      },
    },
  });

  const rows = wallet?.entries.slice(0, PAGE_SIZE) ?? [];

  return (
    <main className="px-4 py-7 sm:px-7 lg:px-9">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold">Wallet ledger</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Immutable credit ledger. Balance is always derived from posted
            transactions.{" "}
            <span className="font-annotation text-xs text-muted-foreground">
              Entries cannot be modified or deleted
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`/api/admin/organizations/${organizationId}/wallet/export`}
            download
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-card"
          >
            Export CSV
          </a>
          {canGrant && <GrantCreditsDialog organizationId={organizationId} />}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-medium text-muted-foreground">
            Current balance
          </p>
          <p className="mt-2 font-display text-3xl font-semibold tabular-nums text-foreground">
            {formatCredits(wallet?.balanceCache ?? 0n)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Version {wallet?.version ?? 0}
          </p>
        </div>
      </div>

      <div className="mt-8 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="p-4 font-medium">Type</th>
              <th className="p-4 text-right font-medium">Amount</th>
              <th className="p-4 text-right font-medium">Balance after</th>
              <th className="p-4 font-medium">Reference</th>
              <th className="p-4 font-medium">Description</th>
              <th className="p-4 font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const positive = isPositiveEntry(row.type);
              return (
                <tr key={row.id} className="hover:bg-muted/30">
                  <td className="p-4">
                    <LedgerTypeBadge type={row.type} />
                  </td>
                  <td
                    className={`p-4 text-right tabular-nums font-semibold ${
                      positive ? "text-success" : "text-foreground"
                    }`}
                  >
                    {positive ? "+" : "−"}
                    {formatCredits(row.amountCredits)}
                  </td>
                  <td className="p-4 text-right tabular-nums text-muted-foreground">
                    {formatCredits(row.balanceAfter)}
                  </td>
                  <td className="p-4">
                    {row.referenceType === "MANUAL_PAYMENT" &&
                    row.referenceId ? (
                      <Link
                        href={
                          `/admin/organizations/${organizationId}/payments/${row.referenceId}` as Route
                        }
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        Payment #{row.referenceId.slice(-6)}
                      </Link>
                    ) : row.referenceType ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {row.referenceType}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-4 text-muted-foreground">
                    {row.description ?? "—"}
                  </td>
                  <td className="p-4 tabular-nums text-muted-foreground">
                    {row.createdAt.toLocaleString("en-OM")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="p-10 text-center text-muted-foreground">
            No ledger entries yet.
          </p>
        ) : null}
      </div>

      {(wallet?.entries.length ?? 0) > PAGE_SIZE ? (
        <Link
          className="mt-4 inline-flex min-h-10 items-center font-semibold text-primary hover:underline"
          href={`?cursor=${rows.at(-1)?.id}` as Route}
        >
          Next page →
        </Link>
      ) : null}
    </main>
  );
}
