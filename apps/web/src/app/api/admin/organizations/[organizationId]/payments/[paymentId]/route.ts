import { hasPlatformPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { confirmPayment, rejectPayment, reversePayment } from "@aiwa/payments";
import { cuidSchema, paymentActionSchema } from "@aiwa/validation";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  paymentError,
  serializeLedgerEntry,
  serializePayment,
} from "@/lib/payments-api";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ organizationId: string; paymentId: string }>;
  },
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

  const { organizationId, paymentId } = await params;
  if (!cuidSchema.safeParse(organizationId).success) {
    return NextResponse.json(
      { error: "Organization not found." },
      { status: 404 },
    );
  }

  const payment = await db.manualPayment.findUnique({
    where: { id: paymentId },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      confirmedBy: { select: { id: true, name: true, email: true } },
    },
  });

  if (!payment || payment.organizationId !== organizationId) {
    return NextResponse.json({ error: "Payment not found." }, { status: 404 });
  }

  let ledgerEntry = null;
  if (payment.ledgerEntryId) {
    ledgerEntry = await db.ledgerEntry.findUnique({
      where: { id: payment.ledgerEntryId },
    });
  }

  return NextResponse.json({
    payment: serializePayment(payment),
    ledgerEntry: ledgerEntry ? serializeLedgerEntry(ledgerEntry) : null,
  });
}

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ organizationId: string; paymentId: string }>;
  },
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

  const { organizationId, paymentId } = await params;
  if (!cuidSchema.safeParse(organizationId).success) {
    return NextResponse.json(
      { error: "Organization not found." },
      { status: 404 },
    );
  }

  const body = (await request.json().catch(() => null)) as unknown;
  const parsed = paymentActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payment action payload", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    let result: Record<string, unknown> = { ok: true };

    switch (parsed.data.action) {
      case "confirm": {
        const { payment, ledgerEntry } = await confirmPayment({
          organizationId,
          paymentId,
          confirmedById: session.user.id,
          creditsPerBaisa: parsed.data.creditsPerBaisa,
          idempotencyKey: parsed.data.idempotencyKey,
        });
        result = {
          ok: true,
          payment: serializePayment(payment),
          ledgerEntry: serializeLedgerEntry(ledgerEntry),
        };
        break;
      }
      case "reject": {
        const payment = await rejectPayment({
          organizationId,
          paymentId,
          actorUserId: session.user.id,
          reason: parsed.data.reason,
          idempotencyKey: parsed.data.idempotencyKey,
        });
        result = {
          ok: true,
          payment: serializePayment(payment),
        };
        break;
      }
      case "reverse": {
        const { payment, ledgerEntry } = await reversePayment({
          organizationId,
          paymentId,
          actorUserId: session.user.id,
          reason: parsed.data.reason,
          idempotencyKey: parsed.data.idempotencyKey,
        });
        result = {
          ok: true,
          payment: serializePayment(payment),
          ledgerEntry: serializeLedgerEntry(ledgerEntry),
        };
        break;
      }
    }

    revalidatePath(`/admin/organizations/${organizationId}/payments`);
    revalidatePath(
      `/admin/organizations/${organizationId}/payments/${paymentId}`,
    );
    revalidatePath(`/admin/organizations/${organizationId}/wallet`);

    return NextResponse.json(result);
  } catch (error) {
    return paymentError(error);
  }
}
