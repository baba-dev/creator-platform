import {
  cancelQueuedGenerationJob,
  CancelGenerationError,
} from "@aiwa/generation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const body = await request.text();
  if (body.length > 1000)
    return NextResponse.json({ error: "Request too large." }, { status: 413 });
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const input = z
    .object({ idempotencyKey: z.uuid() })
    .strict()
    .safeParse(parsed);
  if (!input.success)
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { jobId } = await params;
  try {
    const result = await cancelQueuedGenerationJob({
      jobId,
      actorUserId: session.user.id,
      platformRole: session.user.platformRole,
      idempotencyKey: input.data.idempotencyKey,
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof CancelGenerationError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    return NextResponse.json(
      {
        error:
          "Cancellation could not be completed. Refresh the job before trying again.",
      },
      { status: 500 },
    );
  }
}
