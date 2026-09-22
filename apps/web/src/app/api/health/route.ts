import {
  isBytePlusMediaConfigured,
  isBytePlusVoiceConfigured,
} from "@aiwa/providers/byteplus";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(
    {
      service: "creator-platform-web",
      status: "ok",
      environment: process.env.APP_ENV ?? "local",
      version: process.env.APP_VERSION ?? "dev",
      mediaConfigured: isBytePlusMediaConfigured(),
      voiceConfigured: isBytePlusVoiceConfigured(),
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
