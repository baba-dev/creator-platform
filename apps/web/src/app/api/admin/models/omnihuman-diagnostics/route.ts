import { hasPlatformPermission } from "@aiwa/authz";
import { diagnoseOmniHumanVision } from "@aiwa/providers/byteplus";
import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  if (!hasPlatformPermission(session.user.platformRole, "models:manage"))
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const diagnostics = await diagnoseOmniHumanVision({
    accessKeyId: process.env.BYTEPLUS_VISION_ACCESS_KEY_ID,
    secretAccessKey: process.env.BYTEPLUS_VISION_SECRET_ACCESS_KEY,
    baseUrl: process.env.BYTEPLUS_VISION_BASE_URL,
    requestTimeoutMs: 5000,
    idleTimeoutMs: 5000,
    fetch: globalThis.fetch,
  });
  return NextResponse.json(
    { diagnostics },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
