import { randomUUID } from "node:crypto";
import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { createVoiceJob } from "@aiwa/generation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const synthesizeSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  voiceKey: z.string().trim().min(1).max(100).default("ar-om-salim"),
  speechRate: z.number().min(0.5).max(2.0).default(1.0),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ scriptId: string }> },
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
  const { scriptId } = await params;

  try {
    const script = await db.script.findUnique({
      where: { id: scriptId },
    });
    if (!script) {
      return NextResponse.json({ error: "Script not found." }, { status: 404 });
    }

    const membership = await db.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: script.organizationId,
          userId: session.user.id,
        },
      },
      include: { organization: true },
    });
    if (
      !membership ||
      membership.organization.status !== "ACTIVE" ||
      !hasOrganizationPermission(membership.role, "generation:create")
    ) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const json = await request.json();
    const input = synthesizeSchema.parse(json);

    // Look up default voice model
    const now = new Date();
    const voiceModel = await db.providerModel.findFirst({
      where: {
        mediaKind: "VOICE",
        provider: "BYTEPLUS",
        enabled: true,
      },
      include: {
        priceVersions: {
          where: {
            effectiveFrom: { lte: now },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
          },
          orderBy: { effectiveFrom: "desc" },
          take: 1,
        },
      },
    });

    if (!voiceModel || !voiceModel.priceVersions[0]) {
      return NextResponse.json(
        { error: "Voice synthesis model is not configured." },
        { status: 503 },
      );
    }

    const idempotencyKey = randomUUID();
    const job = await createVoiceJob(session.user.id, {
      organizationId: script.organizationId,
      projectId: script.projectId,
      modelId: voiceModel.id,
      priceVersionId: voiceModel.priceVersions[0].id,
      idempotencyKey,
      text: input.text,
      voiceKey: input.voiceKey,
      speechRate: input.speechRate,
      format: "mp3",
    });

    return NextResponse.json(
      { jobId: job.id, status: job.status },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid synthesis parameters.", issues: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Voice synthesis failed.",
      },
      { status: 500 },
    );
  }
}
