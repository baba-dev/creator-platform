import { db } from "@aiwa/db";
import Link from "next/link";
const PAGE_SIZE = 25;
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { organizationId } = await params;
  const { cursor } = await searchParams;
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
      <h2 className="font-display text-2xl font-semibold">Wallet ledger</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Immutable credit entries. Corrections appear as reversals or
        adjustments.
      </p>
      <div className="mt-5 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="p-4">Type</th>
              <th className="p-4 text-right">Amount</th>
              <th className="p-4 text-right">Balance after</th>
              <th className="p-4">Description</th>
              <th className="p-4">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="p-4">{row.type}</td>
                <td className="p-4 text-right tabular-nums">
                  {row.amountCredits.toLocaleString()}
                </td>
                <td className="p-4 text-right tabular-nums">
                  {row.balanceAfter.toLocaleString()}
                </td>
                <td className="p-4 text-muted-foreground">
                  {row.description ?? "—"}
                </td>
                <td className="p-4">{row.createdAt.toLocaleString("en-OM")}</td>
              </tr>
            ))}
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
          className="mt-4 inline-flex min-h-10 items-center font-semibold text-primary"
          href={`?cursor=${rows.at(-1)?.id}`}
        >
          Next page
        </Link>
      ) : null}
    </main>
  );
}
