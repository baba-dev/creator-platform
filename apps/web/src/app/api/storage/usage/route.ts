import { getUserStorageSummary } from "@aiwa/assets/storage-summary";
import { parseServerEnv } from "@aiwa/config";
import { db } from "@aiwa/db";
import { getRequestSession } from "@/lib/request-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

export async function GET(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  const parsed = z
    .string()
    .min(1)
    .max(100)
    .safeParse(new URL(request.url).searchParams.get("organizationId"));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid organizationId" },
      { status: 400 },
    );
  const organizationId = parsed.data;
  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: { organizationId, userId: session.user.id },
    },
  });
  if (!membership)
    return NextResponse.json(
      { error: "Workspace membership required" },
      { status: 403 },
    );
  const env = parseServerEnv();
  const summary = await getUserStorageSummary(
    db,
    organizationId,
    session.user.id,
    {
      storageRoot: env.ASSET_STORAGE_ROOT,
      encryptionKey: env.STORAGE_ENCRYPTION_KEY,
      googleClientId: env.GOOGLE_DRIVE_CLIENT_ID,
      googleClientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET,
      onedriveClientId: env.ONEDRIVE_CLIENT_ID,
      onedriveClientSecret: env.ONEDRIVE_CLIENT_SECRET,
    },
  );
  return NextResponse.json(summary, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
