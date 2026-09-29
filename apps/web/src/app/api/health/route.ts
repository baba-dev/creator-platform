import {
  isBytePlusMediaConfigured,
  isBytePlusVoiceConfigured,
} from "@aiwa/providers/byteplus";
import { getRequestSession } from "@/lib/request-auth";
import { hasPlatformPermission } from "@aiwa/authz";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const session = await getRequestSession(request.headers);

  if (
    session &&
    hasPlatformPermission(session.user.platformRole, "platform:access")
  ) {
    return Response.json(
      {
        service: "creator-platform-web",
        status: "ok",
        environment: process.env.APP_ENV ?? "local",
        version: process.env.APP_VERSION ?? "dev",
        mediaConfigured: isBytePlusMediaConfigured(),
        voiceConfigured: isBytePlusVoiceConfigured(),
        mailConfigured: Boolean(
          process.env.SMTP_HOST &&
          process.env.SMTP_USER &&
          process.env.SMTP_PASSWORD &&
          process.env.ROUTINE_USER &&
          process.env.ROUTINE_USER_PASSWORD &&
          process.env.MAIL_SECURITY_FROM_ADDRESS &&
          process.env.MAIL_ROUTINE_FROM_ADDRESS,
        ),
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  return Response.json(
    { status: "ok" },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
