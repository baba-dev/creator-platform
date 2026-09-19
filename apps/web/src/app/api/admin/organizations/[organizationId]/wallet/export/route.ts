import { hasPlatformPermission } from "@aiwa/authz";
import { db, type Prisma } from "@aiwa/db";
import { cuidSchema, ledgerExportQuerySchema } from "@aiwa/validation";
import { NextResponse } from "next/server";
import { escapeCsvCell, MAX_EXPORT_ROWS } from "@/lib/csv";
import { formatMuscatCsvTimestamp } from "@/lib/format-baisa";
import { getRequestSession } from "@/lib/request-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  if (!hasPlatformPermission(session.user.platformRole, "payments:read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { organizationId } = await params;
  if (!cuidSchema.safeParse(organizationId).success) {
    return NextResponse.json(
      { error: "Organization not found." },
      { status: 404 },
    );
  }

  const wallet = await db.wallet.findUnique({
    where: { organizationId },
  });
  if (!wallet) {
    return NextResponse.json({ error: "Wallet not found." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = ledgerExportQuerySchema.safeParse({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    type: searchParams.get("type") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid export query", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const whereClause: Prisma.LedgerEntryWhereInput = { walletId: wallet.id };
  if (parsed.data.from || parsed.data.to) {
    whereClause.createdAt = {};
    if (parsed.data.from) whereClause.createdAt.gte = parsed.data.from;
    if (parsed.data.to) whereClause.createdAt.lte = parsed.data.to;
  }
  if (parsed.data.type) whereClause.type = parsed.data.type;

  const entries = await db.ledgerEntry.findMany({
    where: whereClause,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MAX_EXPORT_ROWS + 1,
  });
  if (entries.length > MAX_EXPORT_ROWS) {
    return NextResponse.json(
      {
        error:
          "This export exceeds 50,000 rows. Narrow the date or ledger-type filters.",
      },
      { status: 413 },
    );
  }

  const headers = [
    "Entry ID",
    "Type",
    "Amount (Credits)",
    "Balance After (Credits)",
    "Reference Type",
    "Reference ID",
    "Reversal Of ID",
    "Description",
    "Created At (Asia/Muscat)",
  ];

  const rows = entries.map((entry) => [
    entry.id,
    entry.type,
    entry.amountCredits.toString(),
    entry.balanceAfter.toString(),
    entry.referenceType ?? "",
    entry.referenceId ?? "",
    entry.reversalOfId ?? "",
    entry.description ?? "",
    formatMuscatCsvTimestamp(entry.createdAt),
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ].join("\r\n");

  return new NextResponse(`\uFEFF${csvContent}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="wallet-ledger-${organizationId}.csv"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
