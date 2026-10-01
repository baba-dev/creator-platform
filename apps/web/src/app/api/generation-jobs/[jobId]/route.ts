import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deriveGenerationExperience,
  type GenerationKind,
} from "@/lib/generation-experience";
import { getCustomerJob } from "@/lib/generation-history";
import { getRequestSession } from "@/lib/request-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const organizationId = z
    .string()
    .min(1)
    .max(100)
    .safeParse(new URL(request.url).searchParams.get("organizationId"));
  if (!organizationId.success)
    return NextResponse.json({ error: "Invalid workspace." }, { status: 400 });
  const { jobId } = await params;
  const job = await getCustomerJob(jobId, organizationId.data, session.user.id);
  if (!job)
    return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const historical = await db.generationJob.findMany({
    where: {
      providerModelId: job.providerModelId,
      status: "SUCCEEDED",
      queuedAt: { not: null },
      completedAt: { not: null },
    },
    orderBy: { completedAt: "desc" },
    take: 30,
    select: { queuedAt: true, completedAt: true },
  });
  const historicalDurationsMs = historical.flatMap((sample) =>
    sample.queuedAt && sample.completedAt
      ? [sample.completedAt.getTime() - sample.queuedAt.getTime()]
      : [],
  );
  const kind: GenerationKind =
    job.kind === "VIDEO" ? "VIDEO" : job.kind === "VOICE" ? "VOICE" : "IMAGE";
  const experience = deriveGenerationExperience({
    status: job.status,
    kind,
    queuedAt: job.queuedAt,
    errorMessage: job.errorMessage,
    historicalDurationsMs,
  });

  return NextResponse.json(
    { job, experience },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
