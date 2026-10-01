import { hasPlatformPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { calculateSpeechTrialUsage } from "@aiwa/generation";
import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/request-auth";

export async function GET(request: Request): Promise<NextResponse> {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  if (!hasPlatformPermission(session.user.platformRole, "models:read")) {
    return NextResponse.json(
      { error: "Access denied. Platform model read permission required." },
      { status: 403 },
    );
  }

  try {
    const trialUsage = await calculateSpeechTrialUsage(db);
    return NextResponse.json(
      { trialUsage },
      { headers: { "Cache-Control": "private, no-cache" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to calculate speech trial usage.",
      },
      { status: 500 },
    );
  }
}
