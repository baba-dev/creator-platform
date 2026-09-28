import { hasPlatformPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { createTemplateSchema } from "@aiwa/validation";
import { NextResponse } from "next/server";

import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }
  const session = await getRequestSession(request.headers);
  if (!session || !hasPlatformPermission(session.user.platformRole, "templates:manage")) {
    return NextResponse.json({ error: "Template administration denied." }, { status: 403 });
  }

  const parsed = createTemplateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid template.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.thumbnailAssetId) {
    const thumbnail = await db.asset.findFirst({
      where: {
        id: parsed.data.thumbnailAssetId,
        status: "READY",
        mediaKind: "IMAGE",
      },
      select: { id: true },
    });
    if (!thumbnail) {
      return NextResponse.json({ error: "Thumbnail asset is unavailable." }, { status: 400 });
    }
  }

  try {
    const template = await db.$transaction(async (tx) => {
      const created = await tx.generationTemplate.create({ data: parsed.data });
      await tx.auditEvent.create({
        data: {
          actorUserId: session.user.id,
          action: "template.created",
          targetType: "GenerationTemplate",
          targetId: created.id,
          metadata: {
            slug: created.slug,
            mediaKind: created.mediaKind,
            status: created.status,
          },
        },
      });
      return created;
    });
    return NextResponse.json({ template }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Template could not be created. The slug may already be in use." },
      { status: 409 },
    );
  }
}
