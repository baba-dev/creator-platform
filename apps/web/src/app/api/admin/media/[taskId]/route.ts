import { hasPlatformPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/request-auth";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  if (!hasPlatformPermission(session.user.platformRole, "jobs:read"))
    return NextResponse.json({ error: "Permission denied." }, { status: 403 });
  const { taskId } = await params;
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(taskId))
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  const task = await db.mediaTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      targetId: true,
      organizationId: true,
      kind: true,
      status: true,
      cycle: true,
      attemptCount: true,
      maxAttempts: true,
      errorCode: true,
      nextAttemptAt: true,
      leaseUntil: true,
      updatedAt: true,
      attempts: {
        orderBy: { startedAt: "desc" },
        take: 30,
        select: {
          cycle: true,
          number: true,
          outcome: true,
          errorCode: true,
          startedAt: true,
          finishedAt: true,
        },
      },
    },
  });
  if (!task)
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  return NextResponse.json(task, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
