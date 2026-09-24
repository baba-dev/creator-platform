import { hasPlatformPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { cuidSchema } from "@aiwa/validation";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ mailId: string }> },
) {
  if (!hasTrustedMutationOrigin(request)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }

  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (!hasPlatformPermission(session.user.platformRole, "jobs:manage")) {
    return NextResponse.json({ error: "Permission denied." }, { status: 403 });
  }

  const { mailId } = await params;
  if (!cuidSchema.safeParse(mailId).success) {
    return NextResponse.json({ error: "Mail delivery not found." }, { status: 404 });
  }

  const current = await db.mailMessage.findUnique({
    where: { id: mailId },
    select: { id: true, kind: true, status: true, attemptCount: true },
  });
  if (!current) {
    return NextResponse.json({ error: "Mail delivery not found." }, { status: 404 });
  }
  if (current.kind !== "ROUTINE") {
    return NextResponse.json(
      { error: "Security mail must be regenerated from its source workflow." },
      { status: 409 },
    );
  }
  if (!["FAILED", "RETRY"].includes(current.status)) {
    return NextResponse.json(
      { error: "Only failed or retrying routine mail can be requeued." },
      { status: 409 },
    );
  }

  const updated = await db.mailMessage.update({
    where: { id: current.id },
    data: {
      status: "PENDING",
      nextAttemptAt: null,
      failedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    },
    select: { id: true, status: true },
  });

  await db.auditEvent.create({
    data: {
      actorUserId: session.user.id,
      action: "mail.routine_requeued",
      targetType: "MailMessage",
      targetId: current.id,
      metadata: {
        previousStatus: current.status,
        previousAttemptCount: current.attemptCount,
      },
    },
  });

  revalidatePath("/admin/email");
  return NextResponse.json(updated);
}
