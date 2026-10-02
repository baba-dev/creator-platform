import { hasPlatformPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { VERIFIED_ALL_MODELS } from "@aiwa/providers/catalog";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const PROVIDER_ENUM = {
  byteplus: "BYTEPLUS",
  nvidia: "NVIDIA",
  groq: "GROQ",
  gemini: "GEMINI",
  cloudflare: "CLOUDFLARE",
} as const;

const MEDIA_KIND_ENUM = {
  image: "IMAGE",
  video: "VIDEO",
  voice: "VOICE",
  text: "TEXT",
  reasoning: "REASONING",
} as const;

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
    for (const model of VERIFIED_ALL_MODELS) {
      const provider = PROVIDER_ENUM[model.provider];
      const mediaKind = MEDIA_KIND_ENUM[model.mediaKind];
      await db.providerModel.upsert({
        where: {
          provider_providerModelId: {
            provider,
            providerModelId: model.id,
          },
        },
        update: {
          displayName: model.displayName,
          description: model.description,
          mediaKind,
          capabilities: model.capabilities ?? {},
        },
        create: {
          provider,
          providerModelId: model.id,
          displayName: model.displayName,
          description: model.description,
          mediaKind,
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
