import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const schema = z.object({
  generationCompleted: z.boolean(),
  generationFailed: z.boolean(),
  reports: z.boolean(),
});

export async function GET(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const preference = await db.notificationPreference.findUnique({
    where: { userId: session.user.id },
    select: {
      generationCompleted: true,
      generationFailed: true,
      reports: true,
    },
  });

  return NextResponse.json(
    preference ?? {
      generationCompleted: true,
      generationFailed: true,
      reports: true,
    },
  );
}

export async function PATCH(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }

  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid notification preferences." }, { status: 400 });
  }

  const preference = await db.notificationPreference.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, ...parsed.data },
    update: parsed.data,
    select: {
      generationCompleted: true,
      generationFailed: true,
      reports: true,
    },
  });

  await db.auditEvent.create({
    data: {
      actorUserId: session.user.id,
      action: "user.notification_preferences_updated",
      targetType: "User",
      targetId: session.user.id,
      metadata: preference,
    },
  });

  return NextResponse.json(preference);
}
