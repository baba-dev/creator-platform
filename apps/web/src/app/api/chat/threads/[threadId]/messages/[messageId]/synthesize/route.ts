import { randomUUID } from "node:crypto";
import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import {
  createVoiceJob,
  resolvePresetVoice,
  VoiceResolutionError,
} from "@aiwa/generation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const synthesizeChatVoiceSchema = z.object({
  voiceKey: z.string().trim().max(100).optional(),
  speechRate: z.number().min(0.5).max(2.0).default(1.0),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string; messageId: string }> },
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

  const { threadId, messageId } = await params;

  try {
    const [thread, message] = await Promise.all([
      db.chatThread.findUnique({
        where: { id: threadId },
        include: { persona: true },
      }),
      db.chatMessage.findUnique({
        where: { id: messageId },
      }),
    ]);

    if (!thread || !message || message.threadId !== threadId) {
      return NextResponse.json(
        { error: "Message or thread not found." },
        { status: 404 },
      );
    }

    if (message.role !== "assistant") {
      return NextResponse.json(
        { error: "Only assistant responses can be voiced." },
        { status: 400 },
      );
    }

    const membership = await db.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: thread.organizationId,
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

    const body = await request.json().catch(() => ({}));
    const input = synthesizeChatVoiceSchema.parse(body);

    const voiceKeyToUse =
      input.voiceKey || thread.persona?.voiceKey || "jasper";

    // Verify voice existence
    try {
      resolvePresetVoice(voiceKeyToUse, "seed-tts-2.0");
    } catch (err) {
      if (err instanceof VoiceResolutionError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }

    // Lookup active Seed Speech TTS 2.0 model
    const now = new Date();
    const voiceModel = await db.providerModel.findFirst({
      where: {
        mediaKind: "VOICE",
        provider: "BYTEPLUS",
        providerModelId: "seed-tts-2.0",
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
        { error: "Seed Speech TTS 2.0 model is not configured." },
        { status: 503 },
      );
    }

    const idempotencyKey = randomUUID();
    const job = await createVoiceJob(session.user.id, {
      organizationId: thread.organizationId,
      projectId: thread.projectId,
      modelId: voiceModel.id,
      priceVersionId: voiceModel.priceVersions[0].id,
      idempotencyKey,
      text: message.content,
      voiceKey: voiceKeyToUse,
      speechRate: input.speechRate,
      format: "mp3",
    });

    const currentMeta = (message.metadata as Record<string, unknown>) || {};
    await db.chatMessage.update({
      where: { id: messageId },
      data: {
        metadata: {
          ...currentMeta,
          generationJobId: job.id,
          voiceKey: voiceKeyToUse,
        },
      },
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
          error instanceof Error
            ? error.message
            : "Voice reply synthesis failed.",
      },
      { status: 500 },
    );
  }
}
