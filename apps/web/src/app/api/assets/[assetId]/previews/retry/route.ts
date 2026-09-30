import { rateLimit } from "@/lib/rate-limit";
import {
  retryMediaTask,
  MediaRecoveryError,
} from "@aiwa/assets/media-recovery";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { requireAssetMembership } from "@/lib/asset-api";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
const schema = z
  .object({
    organizationId: z.string().min(1).max(100),
    taskId: z.string().min(1).max(100),
    cycle: z.number().int().min(1).max(3),
  })
  .strict();
const limiter = rateLimit({
  prefix: "media-preview-retry",
  max: 10,
  windowMs: 60_000,
  failureMode: "closed",
});
export async function POST(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const limited = await limiter.check(session.user.id);
  if (limited) return limited;
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json(
      { error: "Invalid retry request." },
      { status: 400 },
    );
  if (!(await requireAssetMembership(session, input.data.organizationId, true)))
    return NextResponse.json(
      { error: "Workspace access denied." },
      { status: 403 },
    );
  const { assetId } = await params;
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(assetId))
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  try {
    await retryMediaTask(input.data.taskId, false, {
      actorUserId: session.user.id,
      expectedCycle: input.data.cycle,
      organizationId: input.data.organizationId,
      assetId,
    });
    return NextResponse.json({ status: "PENDING" }, { status: 202 });
  } catch (error) {
    if (error instanceof MediaRecoveryError)
      return NextResponse.json(
        {
          error:
            error.code === "RETRY_LIMIT"
              ? "Preview retry limit reached. Contact support."
              : error.code === "NOT_FOUND"
                ? "Preview task not found."
                : "Preview state changed. Refresh before retrying.",
        },
        { status: error.code === "NOT_FOUND" ? 404 : 409 },
      );
    return NextResponse.json(
      {
        error: "Preview is unavailable for retry. Refresh or contact support.",
      },
      { status: 409 },
    );
  }
}
