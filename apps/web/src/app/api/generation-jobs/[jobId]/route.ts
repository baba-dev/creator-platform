import { NextResponse } from "next/server";
import { z } from "zod";
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
  return NextResponse.json(
    { job },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
