import { hasPlatformPermission } from "@aiwa/authz";
import { db, type Prisma } from "@aiwa/db";
import {
  cuidSchema,
  paymentExportQuerySchema,
} from "@aiwa/validation";
import { NextResponse } from "next/server";
import {
  formatBaisa,
  formatMuscatCsvTimestamp,
} from "@/lib/format-baisa";
import { escapeCsvCell, MAX_EXPORT_ROWS } from "@/lib/csv";
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

  const { searchParams } = new URL(request.url);
  const parsed = paymentExportQuerySchema.safeParse({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    method: searchParams.get("method") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid export query", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const whereClause: Prisma.ManualPaymentWhereInput = { organizationId };
  if (parsed.data.from || parsed.data.to) {
    whereClause.receivedAt = {};
    if (parsed.data.from) whereClause.receivedAt.gte = parsed.data.from;
    if (parsed.data.to) whereClause.receivedAt.lte = parsed.data.to;
  }
  if (parsed.data.status) whereClause.status = parsed.data.status;
  if (parsed.data.method) whereClause.method = parsed.data.method;

  const payments = await db.manualPayment.findMany({
    where: whereClause,
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    take: MAX_EXPORT_ROWS + 1,
  });
  if (payments.length > MAX_EXPORT_ROWS) {
    return NextResponse.json(
      {
        error:
          "This export exceeds 50,000 rows. Narrow the date or payment filters.",
      },
      { status: 413 },
    );
  }

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
    "Received At (Asia/Muscat)",
    "Confirmed At (Asia/Muscat)",
    "Rejected At (Asia/Muscat)",
    "Reversed At (Asia/Muscat)",
    "Rejection Reason",
    "Reversal Reason",
    "Created At (Asia/Muscat)",
  ];

  const rows = payments.map((payment) => [
    payment.id,
    payment.method,
    payment.status,
    payment.amountBaisa.toString(),
    formatBaisa(payment.amountBaisa),
    payment.creditsGranted?.toString() ?? "",
    payment.creditsPerBaisa?.toString() ?? "",
    payment.reference ?? "",
    payment.chequeNumber ?? "",
    payment.bankName ?? "",
    formatMuscatCsvTimestamp(payment.receivedAt),
    payment.confirmedAt
      ? formatMuscatCsvTimestamp(payment.confirmedAt)
      : "",
    payment.rejectedAt ? formatMuscatCsvTimestamp(payment.rejectedAt) : "",
    payment.reversedAt ? formatMuscatCsvTimestamp(payment.reversedAt) : "",
    payment.rejectionReason ?? "",
    payment.reversalReason ?? "",
    formatMuscatCsvTimestamp(payment.createdAt),
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ].join("\r\n");

  return new NextResponse(`\uFEFF${csvContent}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payments-${organizationId}.csv"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
