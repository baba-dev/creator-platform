import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const DEFAULT_NVIDIA_REASONING_MODEL =
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
const PROMPT_ENHANCEMENT_SYSTEM_PROMPT = [
  "You are an expert creative director for AI image generation.",
  "Improve the user prompt with concrete visual details such as subject, composition, lighting, lens or camera language when useful, atmosphere, materials, and style.",
  "Preserve the user's intent, do not add unrelated subjects or claims, and keep the result concise.",
  'Return JSON with exactly one string property named "enhancedPrompt".',
].join(" ");

const requestSchema = z.object({
  organizationId: z.string().min(1),
  userPrompt: z.string().trim().min(1).max(2000),
  idempotencyKey: z.uuid(),
});

function failure(error: unknown) {
  const status =
    error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 503;
  return NextResponse.json(
    {
      error:
        status === 400
          ? "Invalid prompt enhancement request."
          : "Prompt enhancement service unavailable.",
    },
    { status },
  );
}

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });

  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  if (!process.env.NVIDIA_API_KEY)
    return NextResponse.json(
      { error: "Prompt enhancement is not configured." },
      { status: 503 },
    );

  try {
    const text = await request.text();
    if (text.length > 6000)
      return NextResponse.json(
        { error: "Request too large." },
        { status: 413 },
      );

    const parsed = requestSchema.parse(JSON.parse(text));
    const membership = await db.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: parsed.organizationId,
          userId: session.user.id,
        },
      },
      select: { role: true, organization: { select: { status: true } } },
    });

    if (
      !membership ||
      membership.organization.status !== "ACTIVE" ||
      !hasOrganizationPermission(membership.role, "generation:create")
    )
      return NextResponse.json({ error: "Access denied." }, { status: 403 });

    const configuredModel =
      process.env.NVIDIA_REASONING_MODEL || DEFAULT_NVIDIA_REASONING_MODEL;
    const providerModel = await db.providerModel.findUnique({
      where: {
        provider_providerModelId: {
          provider: "NVIDIA",
          providerModelId: configuredModel,
        },
      },
    });

    if (
      !providerModel ||
      providerModel.mediaKind !== "REASONING" ||
      !providerModel.enabled
    )
      return NextResponse.json(
        { error: "NVIDIA reasoning model is not enabled." },
        { status: 503 },
      );

    const idempotencyKey = `reasoning:${session.user.id}:${parsed.idempotencyKey}`;
    const existing = await db.reasoningJob.findUnique({
      where: { idempotencyKey },
    });

    if (existing) {
      const payload = existing.requestPayload as {
        task?: unknown;
        userPrompt?: unknown;
      };
      if (
        existing.organizationId !== parsed.organizationId ||
        payload.task !== "prompt-enhancement" ||
        payload.userPrompt !== parsed.userPrompt
      )
        return NextResponse.json(
          { error: "Idempotency key was already used for different inputs." },
          { status: 409 },
        );

      return NextResponse.json(
        { jobId: existing.id, status: existing.status },
        { status: 202 },
      );
    }

    const job = await db.reasoningJob.create({
      data: {
        organizationId: parsed.organizationId,
        createdById: session.user.id,
        providerModelId: providerModel.id,
        status: "QUEUED",
        queuedAt: new Date(),
        idempotencyKey,
        requestPayload: {
          task: "prompt-enhancement",
          systemPrompt: PROMPT_ENHANCEMENT_SYSTEM_PROMPT,
          userPrompt: parsed.userPrompt,
          responseSchemaName: "prompt-enhancement-v1",
        },
      },
    });

    return NextResponse.json(
      { jobId: job.id, status: job.status },
      { status: 202 },
    );
  } catch (error) {
    return failure(error);
  }
}
