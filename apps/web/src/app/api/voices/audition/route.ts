import { randomUUID } from "node:crypto";
import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import {
  createVoiceJob,
  GenerationError,
  resolvePresetVoice,
  VoiceResolutionError,
} from "@aiwa/generation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const auditionSchema = z.object({
  organizationId: z.string().min(1),
  voiceKey: z.string().min(1).max(100),
  text: z.string().trim().min(1).max(300),
  speechRate: z.number().min(0.5).max(2.0).default(1.0),
});

export async function POST(request: Request) {
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

  try {
    const body = await request.json();
    const input = auditionSchema.parse(body);

    const membership = await db.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: input.organizationId,
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

    const preset = resolvePresetVoice(input.voiceKey);
    const now = new Date();

    const voiceModel = await db.providerModel.findFirst({
      where: {
        providerModelId: { in: [...preset.supportedModels] },
        mediaKind: "VOICE",
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
        { error: "Voice synthesis model not configured or active." },
        { status: 503 },
      );
    }

    const idempotencyKey = randomUUID();

    const job = await createVoiceJob(session.user.id, {
      organizationId: input.organizationId,
      modelId: voiceModel.id,
      priceVersionId: voiceModel.priceVersions[0].id,
      idempotencyKey,
      text: input.text,
      voiceKey: input.voiceKey,
      speechRate: input.speechRate,
      format: "mp3",
    });

    return NextResponse.json(
      {
        jobId: job.id,
        status: job.status,
        voiceKey: input.voiceKey,
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid audition parameters.", issues: error.issues },
        { status: 400 },
      );
    }
    if (error instanceof VoiceResolutionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof GenerationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "Failed to queue voice audition." },
      { status: 500 },
    );
  }
}
