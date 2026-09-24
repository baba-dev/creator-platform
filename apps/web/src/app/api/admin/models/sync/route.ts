import { hasPlatformPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { VERIFIED_BYTEPLUS_MODELS } from "@aiwa/providers/byteplus";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

export async function POST(request: Request): Promise<NextResponse> {
  if (!hasTrustedMutationOrigin(request)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }

  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  if (!hasPlatformPermission(session.user.platformRole, "models:manage")) {
    return NextResponse.json(
      { error: "You do not have permission to manage models." },
      { status: 403 },
    );
  }

  try {
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

    revalidatePath("/admin/models");

    return NextResponse.json({ success: true, count: syncedCount });
  } catch {
    return NextResponse.json(
      { error: "Failed to synchronize models." },
      { status: 500 },
    );
  }
}
