import {
  hasOrganizationPermission,
  hasPlatformPermission,
} from "@aiwa/authz";
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
      organizationId: true,
      createdById: true,
      providerModelId: true,
      priceVersionId: true,
      status: true,
      outputPayload: true,
      providerRequestId: true,
      inputTokens: true,
      outputTokens: true,
      estimatedProviderCostMicroUsd: true,
      actualProviderCostMicroUsd: true,
      providerCostBasis: true,
      errorCode: true,
      errorMessage: true,
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
    },
  });

  if (!job || job.createdById !== session.user.id)
    return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: job.organizationId,
        userId: session.user.id,
      },
    },
    select: {
      role: true,
      organization: { select: { status: true } },
    },
  });

  if (
    !membership ||
    membership.organization.status !== "ACTIVE" ||
    !hasOrganizationPermission(membership.role, "workspace:view")
  )
    return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const commercial = hasPlatformPermission(
    session.user.platformRole,
    "payments:read",
  );

  return NextResponse.json(
    {
      id: job.id,
      status: job.status,
      outputPayload: job.outputPayload,
      model: {
        id: job.providerModel.id,
        provider: job.providerModel.provider,
        providerModelId: job.providerModel.providerModelId,
        name: job.providerModel.displayName,
      },
      priceVersionId: job.priceVersionId,
      usage: {
        inputTokens: job.inputTokens,
        outputTokens: job.outputTokens,
      },
      ...(commercial
        ? {
            providerCost: {
              estimatedMicroUsd:
                job.estimatedProviderCostMicroUsd?.toString() ?? null,
              actualMicroUsd:
                job.actualProviderCostMicroUsd?.toString() ?? null,
              basis: job.providerCostBasis,
            },
          }
        : {}),
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
