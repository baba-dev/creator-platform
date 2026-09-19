import { hasPlatformPermission } from "@aiwa/authz";
import { grantAdminCredits } from "@aiwa/payments";
import { cuidSchema, grantAdminCreditsSchema } from "@aiwa/validation";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { paymentError, serializeLedgerEntry } from "@/lib/payments-api";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

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

  if (!hasPlatformPermission(session.user.platformRole, "credits:grant")) {
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
  const parsed = grantAdminCreditsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid credit grant request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const entry = await grantAdminCredits({
      organizationId,
      actorUserId: session.user.id,
      amountCredits: parsed.data.amountCredits,
      reason: parsed.data.reason,
      idempotencyKey: parsed.data.idempotencyKey,
    });

    revalidatePath(`/admin/organizations/${organizationId}/wallet`);
    revalidatePath(`/admin/organizations/${organizationId}/payments`);

    return NextResponse.json(
      { ok: true, ledgerEntry: serializeLedgerEntry(entry) },
      { status: 201 },
    );
  } catch (error) {
    return paymentError(error);
  }
}
