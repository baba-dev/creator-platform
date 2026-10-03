import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

export async function GET(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  const organizationId = new URL(request.url).searchParams.get(
    "organizationId",
  );
  if (!organizationId)
    return NextResponse.json(
      { error: "organizationId is required." },
      { status: 400 },
    );

  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: { organizationId, userId: session.user.id },
    },
    include: { organization: true },
  });
  if (!membership || membership.organization.status !== "ACTIVE")
    return NextResponse.json({ error: "Access denied." }, { status: 403 });

  const now = new Date();
  const reminders = await db.assistantReminder.findMany({
    where: {
      userId: session.user.id,
      organizationId,
      cancelledAt: null,
      notifiedAt: null,
      remindAt: { lte: now },
    },
    orderBy: { remindAt: "asc" },
    take: 20,
    select: { id: true, message: true, remindAt: true },
  });

  if (reminders.length)
    await db.assistantReminder.updateMany({
      where: {
        id: { in: reminders.map((reminder) => reminder.id) },
        notifiedAt: null,
        cancelledAt: null,
      },
      data: { notifiedAt: now },
    });

  return NextResponse.json(
    { reminders },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });

  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  const reminderId = new URL(request.url).searchParams.get("id");
  if (!reminderId)
    return NextResponse.json(
      { error: "Reminder id is required." },
      { status: 400 },
    );

  const reminder = await db.assistantReminder.findFirst({
    where: { id: reminderId, userId: session.user.id },
    select: { id: true },
  });
  if (!reminder)
    return NextResponse.json({ error: "Reminder not found." }, { status: 404 });

  await db.assistantReminder.update({
    where: { id: reminder.id },
    data: { cancelledAt: new Date() },
  });
  return NextResponse.json({ cancelled: true });
}
