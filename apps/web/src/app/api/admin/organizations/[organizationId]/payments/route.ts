import { hasPlatformPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { recordPayment } from "@aiwa/payments";
import { cuidSchema, recordPaymentSchema } from "@aiwa/validation";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { paymentError, serializePayment } from "@/lib/payments-api";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

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
  const cursor = searchParams.get("cursor");
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit") ?? 25), 1),
    100,
  );

  const payments = await db.manualPayment.findMany({
    where: { organizationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = payments.length > limit;
  const items = hasMore ? payments.slice(0, limit) : payments;
  const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

  return NextResponse.json({
    payments: items.map(serializePayment),
    nextCursor,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  if (!hasTrustedMutationOrigin(request)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }

  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  if (!hasPlatformPermission(session.user.platformRole, "payments:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { organizationId } = await params;
  if (!cuidSchema.safeParse(organizationId).success) {
    return NextResponse.json(
      { error: "Organization not found." },
      { status: 404 },
    );
  }

  const body = (await request.json().catch(() => null)) as unknown;
  const parsed = recordPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payment data", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const payment = await recordPayment({
      organizationId,
      createdById: session.user.id,
      method: parsed.data.method,
      amountBaisa: parsed.data.amountBaisa,
      receivedAt: parsed.data.receivedAt,
      reference: parsed.data.reference,
      chequeNumber: parsed.data.chequeNumber,
      bankName: parsed.data.bankName,
      notes: parsed.data.notes,
      idempotencyKey: parsed.data.idempotencyKey,
    });

    revalidatePath(`/admin/organizations/${organizationId}/payments`);
    return NextResponse.json(
      { payment: serializePayment(payment) },
      { status: 201 },
    );
  } catch (error) {
    return paymentError(error);
  }
}
