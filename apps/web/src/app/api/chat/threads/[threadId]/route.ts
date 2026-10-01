import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const { threadId } = await params;
  const thread = await db.chatThread.findUnique({
    where: { id: threadId },
    include: { persona: true },
  });

  if (!thread || thread.createdById !== session.user.id) {
    return NextResponse.json({ error: "Thread not found." }, { status: 404 });
  }

  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: thread.organizationId,
        userId: session.user.id,
      },
    },
    include: { organization: true },
  });
  if (!membership || membership.organization.status !== "ACTIVE") {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const newestMessages = await db.chatMessage.findMany({
    where: { threadId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 200,
  });

  return NextResponse.json(
    { thread: { ...thread, messages: newestMessages.reverse() } },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
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

  const { threadId } = await params;
  const thread = await db.chatThread.findUnique({
    where: { id: threadId },
    select: { id: true, organizationId: true, createdById: true },
  });

  if (!thread || thread.createdById !== session.user.id) {
    return NextResponse.json({ error: "Thread not found." }, { status: 404 });
  }

  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: thread.organizationId,
        userId: session.user.id,
      },
    },
    include: { organization: true },
  });
  if (
    !membership ||
    membership.organization.status !== "ACTIVE" ||
    !hasOrganizationPermission(membership.role, "generation:create")
  ) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  await db.chatThread.delete({ where: { id: threadId } });
  return NextResponse.json({ success: true });
}
