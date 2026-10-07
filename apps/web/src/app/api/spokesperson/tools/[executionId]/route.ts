import { db } from "@aiwa/db";
import { requireMembership } from "@aiwa/generation";
import { NextResponse } from "next/server";

import { getRequestSession } from "@/lib/request-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ executionId: string }> },
) {
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  const { executionId } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(executionId))
    return NextResponse.json(
      { error: "Execution not found." },
      { status: 404 },
    );

  const execution = await db.providerToolExecution.findUnique({
    where: { id: executionId },
    include: {
      providerTool: { select: { providerToolId: true, displayName: true } },
      outputAssets: {
        where: { status: "READY" },
        orderBy: { providerToolOutputIndex: "asc" },
        select: { id: true, mimeType: true, durationMs: true },
      },
    },
  });
  if (!execution)
    return NextResponse.json(
      { error: "Execution not found." },
      { status: 404 },
    );

  try {
    const membership = await requireMembership(
      db,
      execution.organizationId,
      session.user.id,
      false,
    );
    if (
      membership.role !== "ORGANIZATION_OWNER" &&
      execution.createdById !== session.user.id
    ) {
      return NextResponse.json(
        { error: "Execution not found." },
        { status: 404 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Execution not found." },
      { status: 404 },
    );
  }

  const result =
    execution.resultPayload &&
    typeof execution.resultPayload === "object" &&
    !Array.isArray(execution.resultPayload)
      ? (execution.resultPayload as Record<string, unknown>)
      : {};
  const vqScore =
    typeof result.vq_score === "number" && Number.isFinite(result.vq_score)
      ? result.vq_score
      : null;

  return NextResponse.json(
    {
      execution: {
        id: execution.id,
        tool: execution.providerTool.providerToolId,
        displayName: execution.providerTool.displayName,
        status: execution.status,
        chargedCredits: execution.chargedCredits.toString(),
        reservedCredits: execution.reservedCredits.toString(),
        errorCode: execution.errorCode,
        errorMessage: execution.errorMessage,
        vqScore,
        outputAssetId: execution.outputAssets[0]?.id ?? null,
        outputMimeType: execution.outputAssets[0]?.mimeType ?? null,
        completedAt: execution.completedAt?.toISOString() ?? null,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
