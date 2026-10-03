import { randomBytes, createHmac } from "node:crypto";
import { parseServerEnv } from "@aiwa/config";
import { getGoogleDriveAuthUrl } from "@aiwa/assets/storage";
import { db } from "@aiwa/db";
import { hasOrganizationPermission } from "@aiwa/authz";
import { getRequestSession } from "@/lib/request-auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  if (!organizationId) {
    return NextResponse.json(
      { error: "organizationId is required" },
      { status: 400 },
    );
  }

  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId: session.user.id,
      },
    },
    include: { organization: true },
  });

  if (
    !membership ||
    !hasOrganizationPermission(membership.role, "organization:manage")
  ) {
    return NextResponse.json(
      { error: "Forbidden: organization owner access required" },
      { status: 403 },
    );
  }

  const env = parseServerEnv();
  if (
    !env.STORAGE_ENCRYPTION_KEY ||
    !env.GOOGLE_DRIVE_CLIENT_ID ||
    !env.GOOGLE_DRIVE_CLIENT_SECRET
  ) {
    return NextResponse.json(
      { error: "Google Drive OAuth or storage encryption is not configured on the server." },
      { status: 503 },
    );
  }

  const nonce = randomBytes(16).toString("hex");
  const payload = `${organizationId}:${session.user.id}:${Date.now()}:${nonce}`;
  const signature = createHmac("sha256", env.AUTH_SECRET)
    .update(payload)
    .digest("hex");
  const state = Buffer.from(`${payload}:${signature}`).toString("base64url");

  const redirectUri = `${env.APP_URL}/api/storage/oauth/google/callback`;
  const authUrl = getGoogleDriveAuthUrl({
    clientId: env.GOOGLE_DRIVE_CLIENT_ID,
    redirectUri,
    state,
  });

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("aiwa_oauth_gdrive_state", state, {
    httpOnly: true,
    secure: env.APP_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  return response;
}
