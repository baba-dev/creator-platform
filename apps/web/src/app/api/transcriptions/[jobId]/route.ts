import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { NextResponse } from "next/server";

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

  const { jobId } = await params;
  const job = await db.generationJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      organizationId: true,
      createdById: true,
      status: true,
      errorCode: true,
      errorMessage: true,
      requestPayload: true,
      outputPayload: true,
      reservedCredits: true,
      chargedCredits: true,
      actualProviderCostMicroUsd: true,
      providerCostBasis: true,
      createdAt: true,
      completedAt: true,
      providerModel: {
        select: {
          id: true,
          provider: true,
          providerModelId: true,
          displayName: true,
        },
      },
      assets: {
        where: { status: "READY", mediaKind: "DOCUMENT" },
        orderBy: { generationOutputIndex: "asc" },
        select: {
          id: true,
          name: true,
          mimeType: true,
          byteSize: true,
          generationOutputIndex: true,
        },
      },
    },
  });
  if (!job)
    return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const payload =
    job.requestPayload &&
    typeof job.requestPayload === "object" &&
    !Array.isArray(job.requestPayload)
      ? (job.requestPayload as Record<string, unknown>)
      : {};
  if (payload.task !== "transcription")
    return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: job.organizationId,
        userId: session.user.id,
      },
    },
    include: { organization: true },
  });
  if (
    !membership ||
    membership.organization.status !== "ACTIVE" ||
    !hasOrganizationPermission(membership.role, "workspace:view") ||
    (membership.role !== "ORGANIZATION_OWNER" &&
      job.createdById !== session.user.id)
  )
    return NextResponse.json({ error: "Job not found." }, { status: 404 });

  return NextResponse.json(
    {
      id: job.id,
      status: job.status,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      output: job.outputPayload,
      reservedCredits: job.reservedCredits.toString(),
      chargedCredits: job.chargedCredits.toString(),
      providerCostBasis: job.providerCostBasis,
      model: {
        id: job.providerModel.id,
        provider: job.providerModel.provider,
        providerModelId: job.providerModel.providerModelId,
        name: job.providerModel.displayName,
      },
      assets: job.assets.map((asset) => ({
        ...asset,
        byteSize: asset.byteSize.toString(),
        downloadUrl: `/api/assets/${asset.id}?download=1`,
      })),
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
