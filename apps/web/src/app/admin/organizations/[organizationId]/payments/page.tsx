import { db } from "@aiwa/db";
import Link from "next/link";
import { requirePlatformPermission } from "@/lib/request-auth";
const PAGE_SIZE = 25;
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  await requirePlatformPermission("payments:read");
  const { organizationId } = await params;
  const { cursor } = await searchParams;
  const records = await db.manualPayment.findMany({
    where: { organizationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      method: true,
      status: true,
      amountBaisa: true,
      receivedAt: true,
      createdAt: true,
      createdBy: { select: { name: true } },
    },
  });
  const rows = records.slice(0, PAGE_SIZE);
  return (
    <main className="px-4 py-7 sm:px-7 lg:px-9">
      <h2 className="font-display text-2xl font-semibold">Payment history</h2>
      <div className="mt-5 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="p-4">Method</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Amount (baisa)</th>
              <th className="p-4">Recorded by</th>
              <th className="p-4">Received</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="p-4">{row.method}</td>
                <td className="p-4">{row.status}</td>
                <td className="p-4 text-right tabular-nums">
                  {row.amountBaisa.toLocaleString()}
                </td>
                <td className="p-4">{row.createdBy.name}</td>
                <td className="p-4">
                  {row.receivedAt.toLocaleString("en-OM")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="p-10 text-center text-muted-foreground">
            No payments yet.
          </p>
        ) : null}
      </div>
      {records.length > PAGE_SIZE ? (
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
