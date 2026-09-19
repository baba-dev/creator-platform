import { hasPlatformPermission } from "@aiwa/authz";
import { db, type Prisma } from "@aiwa/db";
import { cuidSchema, ledgerExportQuerySchema } from "@aiwa/validation";
import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/request-auth";

function escapeCsvCell(
  value: string | number | bigint | null | undefined,
): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

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

  const whereClause: Prisma.LedgerEntryWhereInput = { walletId: wallet.id };
  if (parsed.success) {
    if (parsed.data.from || parsed.data.to) {
      whereClause.createdAt = {};
      if (parsed.data.from) whereClause.createdAt.gte = parsed.data.from;
      if (parsed.data.to) whereClause.createdAt.lte = parsed.data.to;
    }
    if (parsed.data.type) {
      whereClause.type = parsed.data
        .type as Prisma.EnumLedgerEntryTypeFilter["equals"];
    }
  }

  const entries = await db.ledgerEntry.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
  });

  const headers = [
    "Entry ID",
    "Type",
    "Amount (Credits)",
    "Balance After (Credits)",
    "Reference Type",
    "Reference ID",
    "Reversal Of ID",
    "Description",
    "Created At",
  ];

  const rows = entries.map((e) => [
    e.id,
    e.type,
    e.amountCredits.toString(),
    e.balanceAfter.toString(),
    e.referenceType ?? "",
    e.referenceId ?? "",
    e.reversalOfId ?? "",
    e.description ?? "",
    e.createdAt.toISOString(),
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ].join("\r\n");

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="wallet-ledger-${organizationId}.csv"`,
    },
  });
}
