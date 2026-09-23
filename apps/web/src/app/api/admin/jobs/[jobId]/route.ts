import { randomUUID } from "node:crypto";
import { hasPlatformPermission } from "@aiwa/authz";
import {
  getJobReconciliationDetails,
  JobReconciliationError,
  reconcileProviderOutcome,
  recoverGeneratedOutput,
  refundSettledJob,
  releaseJobReservation,
} from "@aiwa/generation";
import { jobResolutionActionSchema } from "@aiwa/validation";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { serializeJobDetails } from "@/lib/job-serialization";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

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
  const details = await getJobReconciliationDetails(jobId);

  if (!details) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  return NextResponse.json(serializeJobDetails(details));
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  return handleAction(request, params);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  return handleAction(request, params);
}

async function handleAction(
  request: Request,
  paramsPromise: Promise<{ jobId: string }>,
) {
  if (!hasTrustedMutationOrigin(request)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }

  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  if (!hasPlatformPermission(session.user.platformRole, "jobs:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { jobId } = await paramsPromise;
  const rawBody = (await request.json().catch(() => null)) as unknown;
  const parsed = jobResolutionActionSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid request payload.",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const action = parsed.data;

  try {
    let result: { success: boolean; message: string };

    switch (action.action) {
      case "reconcile": {
        result = await reconcileProviderOutcome({
          jobId,
          actorUserId: session.user.id,
          outcome: action.outcome,
          evidence: action.evidence,
          providerRequestId: action.providerRequestId,
          actualProviderCostMicroUsd: action.actualProviderCostMicroUsd,
          notes: action.notes,
          idempotencyKey: action.idempotencyKey,
        });
        break;
      }

      case "recover": {
        result = await recoverGeneratedOutput({
          jobId,
          actorUserId: session.user.id,
          reason: action.reason,
          outputUrl: action.outputUrl,
          mode: action.mode,
          idempotencyKey: action.idempotencyKey,
        });
        break;
      }

      case "release": {
        result = await releaseJobReservation({
          jobId,
          actorUserId: session.user.id,
          reason: action.reason,
          evidence: action.evidence,
          idempotencyKey: action.idempotencyKey,
        });
        break;
      }

      case "refund": {
        result = await refundSettledJob({
          jobId,
          actorUserId: session.user.id,
          reason: action.reason,
          amountCredits: action.amountCredits,
          idempotencyKey: action.idempotencyKey,
        });
        break;
      }
    }

    revalidatePath("/admin/jobs");
    revalidatePath(`/admin/jobs/${jobId}`);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof JobReconciliationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }

    const requestId = randomUUID();
    console.error("Administrative generation resolution failed", {
      requestId,
      jobId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      {
        error: "Administrative resolution failed unexpectedly.",
        requestId,
      },
      { status: 500 },
    );
  }
}
