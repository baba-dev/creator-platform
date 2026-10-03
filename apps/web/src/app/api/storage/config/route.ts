import { parseServerEnv } from "@aiwa/config";
import { db } from "@aiwa/db";
import { hasOrganizationPermission } from "@aiwa/authz";
import { getRequestSession } from "@/lib/request-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

const switchSchema = z.object({
  organizationId: z.string().min(1),
  provider: z.enum(["LOCAL", "GOOGLE_DRIVE", "ONEDRIVE"]),
});

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

  if (!membership) {
    return NextResponse.json(
      { error: "Workspace membership required" },
      { status: 403 },
    );
  }

  const env = parseServerEnv();
  const configs = await db.externalStorageConfig.findMany({
    where: { organizationId },
    select: {
      id: true,
      provider: true,
      status: true,
      accountEmail: true,
      rootFolderName: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    activeProvider: membership.organization.defaultStorageProvider,
    canManage: hasOrganizationPermission(
      membership.role,
      "organization:manage",
    ),
    availableProviders: {
      googleDriveConfigured: Boolean(
        env.STORAGE_ENCRYPTION_KEY &&
          env.GOOGLE_DRIVE_CLIENT_ID &&
          env.GOOGLE_DRIVE_CLIENT_SECRET,
      ),
      oneDriveConfigured: Boolean(
        env.STORAGE_ENCRYPTION_KEY &&
          env.ONEDRIVE_CLIENT_ID &&
          env.ONEDRIVE_CLIENT_SECRET,
      ),
    },
    configs,
  });
}

export async function POST(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = switchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { organizationId, provider } = parsed.data;

  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId: session.user.id,
      },
    },
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

  if (provider !== "LOCAL") {
    const env = parseServerEnv();
    const serverReady =
      Boolean(env.STORAGE_ENCRYPTION_KEY) &&
      (provider === "GOOGLE_DRIVE"
        ? Boolean(env.GOOGLE_DRIVE_CLIENT_ID && env.GOOGLE_DRIVE_CLIENT_SECRET)
        : Boolean(env.ONEDRIVE_CLIENT_ID && env.ONEDRIVE_CLIENT_SECRET));
    if (!serverReady) {
      return NextResponse.json(
        { error: `Cannot switch to ${provider}: server integration is not configured.` },
        { status: 503 },
      );
    }

    const config = await db.externalStorageConfig.findUnique({
      where: {
        organizationId_provider: {
          organizationId,
          provider,
        },
      },
    });

    if (!config || config.status !== "ACTIVE") {
      return NextResponse.json(
        { error: `Cannot switch to ${provider}: account is not connected.` },
        { status: 400 },
      );
    }
  }

  await db.organization.update({
    where: { id: organizationId },
    data: { defaultStorageProvider: provider },
  });

  return NextResponse.json({ success: true, activeProvider: provider });
}

export async function DELETE(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  const provider = url.searchParams.get("provider");

  if (
    !organizationId ||
    !provider ||
    !["GOOGLE_DRIVE", "ONEDRIVE"].includes(provider)
  ) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
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

  const dependentAssets = await db.asset.count({
    where: {
      organizationId,
      storageProvider: provider as "GOOGLE_DRIVE" | "ONEDRIVE",
    },
  });
  if (dependentAssets > 0) {
    return NextResponse.json(
      {
        error:
          "This connection still stores workspace assets. Move or permanently delete those assets before disconnecting it.",
        dependentAssets,
      },
      { status: 409 },
    );
  }

  await db.$transaction(async (tx) => {
    await tx.externalStorageConfig.deleteMany({
      where: {
        organizationId,
        provider: provider as "GOOGLE_DRIVE" | "ONEDRIVE",
      },
    });

    if (membership.organization.defaultStorageProvider === provider) {
      await tx.organization.update({
        where: { id: organizationId },
        data: { defaultStorageProvider: "LOCAL" },
      });
    }
  });

  return NextResponse.json({ success: true });
}
