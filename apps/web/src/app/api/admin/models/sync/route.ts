import { NextResponse } from "next/server";

import { db } from "@aiwa/db";
import { VERIFIED_BYTEPLUS_MODELS } from "@aiwa/providers/byteplus";

import { requirePlatformPermission } from "@/lib/request-auth";

export async function POST() {
  try {
    const session = await requirePlatformPermission("models:manage");

    let syncedCount = 0;
    for (const model of VERIFIED_BYTEPLUS_MODELS) {
      await db.providerModel.upsert({
        where: {
          provider_providerModelId: {
            provider: "BYTEPLUS",
            providerModelId: model.id,
          },
        },
        update: {
          displayName: model.displayName,
          description: model.description,
          mediaKind: model.mediaKind.toUpperCase() as
            "IMAGE" | "VIDEO" | "VOICE",
          capabilities: model.capabilities ?? {},
        },
        create: {
          provider: "BYTEPLUS",
          providerModelId: model.id,
          displayName: model.displayName,
          description: model.description,
          mediaKind: model.mediaKind.toUpperCase() as
            "IMAGE" | "VIDEO" | "VOICE",
          capabilities: model.capabilities ?? {},
          enabled: false,
        },
      });
      syncedCount++;
    }

    await db.auditEvent.create({
      data: {
        actorUserId: session.user.id,
        action: "models.synced",
        targetType: "Platform",
      },
    });

    return NextResponse.json({ success: true, count: syncedCount });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      {
        status:
          error instanceof Error && error.message.includes("Access denied")
            ? 403
            : 500,
      },
    );
  }
}
