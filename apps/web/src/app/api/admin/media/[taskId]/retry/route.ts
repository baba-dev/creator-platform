import { hasPlatformPermission } from "@aiwa/authz";
import {
  retryMediaTask,
  MediaRecoveryError,
} from "@aiwa/assets/media-recovery";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import { rateLimit } from "@/lib/rate-limit";
const schema = z.object({ cycle: z.number().int().min(1).max(3) }).strict();
const limiter = rateLimit({
  prefix: "admin-media-retry",
  max: 10,
  windowMs: 60_000,
  failureMode: "closed",
});
export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  if (!hasPlatformPermission(session.user.platformRole, "jobs:manage"))
    return NextResponse.json({ error: "Permission denied." }, { status: 403 });
  const limited = await limiter.check(session.user.id);
  if (limited) return limited;
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json(
      { error: "Invalid retry request." },
      { status: 400 },
    );
  const { taskId } = await params;
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(taskId))
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  try {
    await retryMediaTask(taskId, false, {
      actorUserId: session.user.id,
      expectedCycle: input.data.cycle,
    });
    return NextResponse.json({ status: "PENDING" }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof MediaRecoveryError && error.code === "RETRY_LIMIT"
            ? "Web retry limit reached. Use the operator runbook for further recovery."
            : "Task is not eligible for retry. Refresh its state or follow the recovery runbook.",
      },
      { status: 409 },
    );
  }
}
