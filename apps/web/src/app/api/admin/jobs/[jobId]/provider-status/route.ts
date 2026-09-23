import { hasPlatformPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { getDefaultGenerationProvider } from "@aiwa/generation";
import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/request-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  if (!hasPlatformPermission(session.user.platformRole, "jobs:read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { jobId } = await params;
  const job = await db.generationJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      providerRequestId: true,
      providerModel: { select: { mediaKind: true } },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  if (!job.providerRequestId) {
    return NextResponse.json(
      { error: "Job has no recorded provider request ID." },
      { status: 400 },
    );
  }

  const provider = getDefaultGenerationProvider();
  if (!provider) {
    return NextResponse.json(
      { error: "Generation provider credentials not configured on server." },
      { status: 503 },
    );
  }

  try {
    const result = await provider.getJob(job.providerRequestId);
    return NextResponse.json({
      providerRequestId: result.providerRequestId,
      status: result.status,
      outputUrls: result.outputUrls ?? [],
      errorCode: result.errorCode,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to query provider.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
