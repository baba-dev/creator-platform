import { createHmac } from "node:crypto";
import { parseServerEnv } from "@aiwa/config";
import { encryptSecret } from "@aiwa/assets/crypto";
import {
  ensureOneDriveCreatorsFolder,
  exchangeOneDriveCode,
} from "@aiwa/assets/storage";
import { db } from "@aiwa/db";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

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
    if (signature !== expectedSig) throw new Error("Invalid state signature");

    if (Date.now() - Number(timestampStr) > 900_000) {
      throw new Error("Expired state");
    }
  } catch {
    return NextResponse.redirect(`${env.APP_URL}/app?error=invalid_state`);
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
    console.error("OneDrive connection error:", error);
    return NextResponse.redirect(
      `${env.APP_URL}/app/${org.slug}/storage?error=connection_failed`,
    );
  }
}
