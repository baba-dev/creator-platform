import { hasPlatformPermission } from "@aiwa/authz";
import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/request-auth";
import { mediaOperationsSnapshot } from "@/lib/media-operations";
export async function GET(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  if (!hasPlatformPermission(session.user.platformRole, "jobs:read"))
    return NextResponse.json({ error: "Permission denied." }, { status: 403 });
  return NextResponse.json(await mediaOperationsSnapshot(), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
