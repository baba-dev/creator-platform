import { hasPlatformPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { updateTemplateSchema } from "@aiwa/validation";
import { NextResponse } from "next/server";

import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!hasTrustedMutationOrigin(request)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }
  const session = await getRequestSession(request.headers);
  if (!session || !hasPlatformPermission(session.user.platformRole, "templates:manage")) {
    return NextResponse.json({ error: "Template administration denied." }, { status: 403 });
  }

  const { id } = await params;
  const parsed = updateTemplateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json(
      { error: "Invalid template update.", issues: parsed.success ? undefined : parsed.error.flatten() },
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

  const existing = await db.generationTemplate.findUnique({
    where: { id },
    select: { id: true, status: true, slug: true },
  });
  if (!existing) return NextResponse.json({ error: "Template not found." }, { status: 404 });

  try {
    const template = await db.$transaction(async (tx) => {
      const updated = await tx.generationTemplate.update({
        where: { id },
        data: parsed.data,
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: session.user.id,
          action: "template.updated",
          targetType: "GenerationTemplate",
          targetId: id,
          metadata: {
            previousStatus: existing.status,
            status: updated.status,
            slug: updated.slug,
          },
        },
      });
      return updated;
    });
    return NextResponse.json({ template });
  } catch {
    return NextResponse.json(
      { error: "Template could not be updated. Check the slug and referenced assets." },
      { status: 409 },
    );
  }
}
