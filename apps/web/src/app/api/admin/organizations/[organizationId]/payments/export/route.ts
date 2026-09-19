import { hasPlatformPermission } from "@aiwa/authz";
import { db, type Prisma } from "@aiwa/db";
import { cuidSchema, ledgerExportQuerySchema } from "@aiwa/validation";
import { NextResponse } from "next/server";
import { formatBaisa } from "@/lib/format-baisa";
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

  const { searchParams } = new URL(request.url);
  const parsed = ledgerExportQuerySchema.safeParse({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    type: searchParams.get("type") ?? undefined,
  });

  const whereClause: Prisma.ManualPaymentWhereInput = { organizationId };
  if (parsed.success) {
    if (parsed.data.from || parsed.data.to) {
      whereClause.receivedAt = {};
      if (parsed.data.from) whereClause.receivedAt.gte = parsed.data.from;
      if (parsed.data.to) whereClause.receivedAt.lte = parsed.data.to;
    }
    if (parsed.data.type) {
      whereClause.method = parsed.data
        .type as Prisma.EnumPaymentMethodFilter["equals"];
    }
  }

  const payments = await db.manualPayment.findMany({
    where: whereClause,
    orderBy: { receivedAt: "desc" },
  });

  const headers = [
    "Payment ID",
    "Method",
    "Status",
    "Amount (Baisa)",
    "Amount (OMR)",
    "Credits Granted",
    "Credits Per Baisa",
    "Reference",
    "Cheque Number",
    "Bank Name",
    "Received At",
    "Confirmed At",
    "Rejected At",
    "Reversed At",
    "Rejection Reason",
    "Reversal Reason",
    "Created At",
  ];

  const rows = payments.map((p) => [
    p.id,
    p.method,
    p.status,
    p.amountBaisa.toString(),
    formatBaisa(p.amountBaisa),
    p.creditsGranted?.toString() ?? "",
    p.creditsPerBaisa?.toString() ?? "",
    p.reference ?? "",
    p.chequeNumber ?? "",
    p.bankName ?? "",
    p.receivedAt.toISOString(),
    p.confirmedAt?.toISOString() ?? "",
    p.rejectedAt?.toISOString() ?? "",
    p.reversedAt?.toISOString() ?? "",
    p.rejectionReason ?? "",
    p.reversalReason ?? "",
    p.createdAt.toISOString(),
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ].join("\r\n");

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payments-${organizationId}.csv"`,
    },
  });
}
