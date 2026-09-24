import { hasPlatformPermission } from "@aiwa/authz";
import { parseServerEnv } from "@aiwa/config";
import { db } from "@aiwa/db";
import {
  classifySmtpFailure,
  verifySmtpTransport,
} from "@aiwa/mail/transport";
import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

export async function POST(request: Request) {
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
  if (!hasPlatformPermission(session.user.platformRole, "jobs:manage")) {
    return NextResponse.json({ error: "Permission denied." }, { status: 403 });
  }

  const env = parseServerEnv();
  if (!env.MAIL_ENABLED) {
    return NextResponse.json(
      { ok: false, code: "MAIL_DISABLED" },
      { status: 409 },
    );
  }

  try {
    await verifySmtpTransport(env);
    await db.auditEvent.create({
      data: {
        actorUserId: session.user.id,
        action: "mail.smtp_verified",
        targetType: "MailTransport",
        metadata: {
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
        },
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = classifySmtpFailure(error);
    await db.auditEvent.create({
      data: {
        actorUserId: session.user.id,
        action: "mail.smtp_verification_failed",
        targetType: "MailTransport",
        metadata: {
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          code: failure.code,
        },
      },
    });
    return NextResponse.json(
      { ok: false, code: failure.code },
      { status: 503 },
    );
  }
}
