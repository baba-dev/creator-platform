import { hasPlatformPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestSession } from "@/lib/request-auth";
const query = z.object({
  status: z
    .enum([
      "PENDING",
      "PROCESSING",
      "RETRY_WAIT",
      "FAILED",
      "REVIEW",
      "SUCCEEDED",
    ])
    .optional(),
  cursor: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,100}$/)
    .optional(),
});
export async function GET(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  if (!hasPlatformPermission(session.user.platformRole, "jobs:read"))
    return NextResponse.json({ error: "Permission denied." }, { status: 403 });
  const input = query.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!input.success)
    return NextResponse.json({ error: "Invalid task query." }, { status: 400 });
  const rows = await db.mediaTask.findMany({
    where: input.data.status ? { status: input.data.status } : {},
    ...(input.data.cursor
      ? { cursor: { id: input.data.cursor }, skip: 1 }
      : {}),
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 51,
    select: {
      id: true,
      organizationId: true,
      targetId: true,
      kind: true,
      status: true,
      cycle: true,
      attemptCount: true,
      maxAttempts: true,
      nextAttemptAt: true,
      leaseUntil: true,
      errorCode: true,
      updatedAt: true,
    },
  });
  return NextResponse.json(
    {
      tasks: rows.slice(0, 50),
      nextCursor: rows.length > 50 ? rows[49]!.id : null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
