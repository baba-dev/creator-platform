import { createHmac, timingSafeEqual } from "node:crypto";
import { parseServerEnv } from "@aiwa/config";
import { encryptSecret } from "@aiwa/assets/crypto";
import {
  ensureOneDriveCreatorsFolder,
  exchangeOneDriveCode,
} from "@aiwa/assets/storage";
import { db } from "@aiwa/db";
import { hasOrganizationPermission } from "@aiwa/authz";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/request-auth";

export async function GET(request: Request) {
  const env = parseServerEnv();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const cookieStore = await cookies();
  const storedState = cookieStore.get("aiwa_oauth_onedrive_state")?.value;

  if (errorParam || !code || !state || state !== storedState) {
    return NextResponse.redirect(`${env.APP_URL}/app?error=oauth_failed`);
  }

  let organizationId: string;
  let userId: string;
  let timestampStr: string;
  let nonce: string;
  let signature: string;

  try {
    const raw = Buffer.from(state, "base64url").toString("utf8");
    const parts = raw.split(":");
    if (parts.length !== 5) throw new Error("Invalid state components");
    [organizationId, userId, timestampStr, nonce, signature] = parts as [
      string,
      string,
      string,
      string,
      string,
    ];
    const payload = `${organizationId}:${userId}:${timestampStr}:${nonce}`;
    const expectedSig = createHmac("sha256", env.AUTH_SECRET)
      .update(payload)
      .digest("hex");
    const received = Buffer.from(signature, "hex");
    const expected = Buffer.from(expectedSig, "hex");
    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      throw new Error("Invalid state signature");
    }

    const issuedAt = Number(timestampStr);
    const age = Date.now() - issuedAt;
    if (!Number.isFinite(issuedAt) || age < -60_000 || age > 600_000) {
      throw new Error("Expired state");
    }
  } catch {
    return NextResponse.redirect(`${env.APP_URL}/app?error=invalid_state`);
  }

  const session = await getRequestSession(request.headers);
  if (!session || session.user.id !== userId) {
    return NextResponse.redirect(`${env.APP_URL}/app?error=invalid_state`);
  }

  if (
    !env.STORAGE_ENCRYPTION_KEY ||
    !env.ONEDRIVE_CLIENT_ID ||
    !env.ONEDRIVE_CLIENT_SECRET
  ) {
    return NextResponse.redirect(
      `${env.APP_URL}/app?error=storage_not_configured`,
    );
  }

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { slug: true },
  });
  if (!org) {
    return NextResponse.redirect(`${env.APP_URL}/app?error=org_not_found`);
  }

  const redirectUri = `${env.APP_URL}/api/storage/oauth/onedrive/callback`;

  try {
    const tokens = await exchangeOneDriveCode({
      clientId: env.ONEDRIVE_CLIENT_ID!,
      clientSecret: env.ONEDRIVE_CLIENT_SECRET!,
      redirectUri,
      code,
    });

    const folderId = await ensureOneDriveCreatorsFolder(tokens.accessToken);

    const encryptedRefreshToken = encryptSecret(
      tokens.refreshToken,
      env.STORAGE_ENCRYPTION_KEY,
    );
    const encryptedAccessToken = encryptSecret(
      tokens.accessToken,
      env.STORAGE_ENCRYPTION_KEY,
    );
    const accessTokenExpiresAt = new Date(Date.now() + tokens.expiresIn * 1000);

    await db.$transaction(async (tx) => {
      // A workspace role can be revoked while OAuth consent is underway.
      const membership = await tx.membership.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
        include: { organization: true },
      });
      if (
        !membership ||
        membership.organization.status !== "ACTIVE" ||
        !hasOrganizationPermission(membership.role, "organization:manage")
      ) {
        throw new Error("Storage authorization revoked");
      }
      await tx.externalStorageConfig.upsert({
        where: {
          organizationId_provider: {
            organizationId,
            provider: "ONEDRIVE",
          },
        },
        create: {
          organizationId,
          userId,
          provider: "ONEDRIVE",
          status: "ACTIVE",
          accountEmail: tokens.accountEmail ?? null,
          rootFolderId: folderId,
          rootFolderName: "Creators-Data",
          encryptedRefreshToken,
          encryptedAccessToken,
          accessTokenExpiresAt,
        },
        update: {
          userId,
          status: "ACTIVE",
          accountEmail: tokens.accountEmail ?? null,
          rootFolderId: folderId,
          encryptedRefreshToken,
          encryptedAccessToken,
          accessTokenExpiresAt,
        },
      });

      await tx.organization.update({
        where: { id: organizationId },
        data: { defaultStorageProvider: "ONEDRIVE" },
      });
    });

    const res = NextResponse.redirect(
      `${env.APP_URL}/app/${org.slug}/storage?connected=onedrive`,
    );
    res.cookies.delete("aiwa_oauth_onedrive_state");
    return res;
  } catch (error) {
    console.error("OneDrive connection failed", {
      errorName: error instanceof Error ? error.name : "Unknown",
    });
    return NextResponse.redirect(
      `${env.APP_URL}/app/${org.slug}/storage?error=connection_failed`,
    );
  }
}
