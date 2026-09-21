import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/request-auth";

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  const { jobId } = await context.params;
  const job = await db.reasoningJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      createdById: true,
      status: true,
      outputPayload: true,
      errorMessage: true,
      createdAt: true,
      completedAt: true,
    },
  });

  if (!job || job.createdById !== session.user.id)
    return NextResponse.json({ error: "Job not found." }, { status: 404 });

  return NextResponse.json(
    {
      id: job.id,
      status: job.status,
      outputPayload: job.outputPayload,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
