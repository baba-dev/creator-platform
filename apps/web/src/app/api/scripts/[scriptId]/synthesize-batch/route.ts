import { createHash } from "node:crypto";
import { hasOrganizationPermission } from "@aiwa/authz";
import { db, Prisma } from "@aiwa/db";
import { createVoiceJob, resolvePresetVoice } from "@aiwa/generation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const batchSynthesizeSchema = z.object({
  blockIds: z
    .array(z.string().min(1).max(64))
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Block ids must be unique.",
    })
    .optional(),
});

function deterministicUuid(value: string): string {
  const digest = createHash("sha256").update(value).digest("hex");
  const variantNibble = (
    (Number.parseInt(digest[16]!, 16) & 0x3) |
    0x8
  ).toString(16);
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `5${digest.slice(13, 16)}`,
    `${variantNibble}${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join("-");
}

interface ScriptSceneBlock {
  id: string;
  type: string;
  character?: string;
  parenthetical?: string;
  text: string;
  audioJobId?: string;
  voiceKey?: string;
}

interface ScriptContentData {
  scenes?: ScriptSceneBlock[];
  voiceAssignments?: Record<string, { voiceKey: string; speechRate?: number }>;
}

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

    const body = await request.json().catch(() => ({}));
    const input = batchSynthesizeSchema.parse(body);

    const content = (script.content as ScriptContentData) || {};
    const scenes = content.scenes || [];
    const voiceAssignments = content.voiceAssignments || {};

    const dialogueBlocks = scenes.filter((block) => {
      if (block.type !== "dialogue" || !block.text.trim()) return false;
      if (input.blockIds && input.blockIds.length > 0) {
        return input.blockIds.includes(block.id);
      }
      return true;
    });

    if (dialogueBlocks.length === 0) {
      return NextResponse.json(
        { error: "No eligible dialogue blocks found to synthesize." },
        { status: 400 },
      );
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
        { error: "Voice synthesis model is not configured." },
        { status: 503 },
      );
    }

    const queuedJobs: Array<{ blockId: string; jobId: string }> = [];
    const failedBlocks: Array<{ blockId: string; error: string }> = [];
    const updatedScenes = [...scenes];

    for (const block of dialogueBlocks) {
      const charName = (block.character || "").toUpperCase().trim();
      const assignment = voiceAssignments[charName];
      let voiceKeyToUse = assignment?.voiceKey || block.voiceKey || "jasper";
      const speechRateToUse = assignment?.speechRate ?? 1.0;

      try {
        resolvePresetVoice(voiceKeyToUse, "seed-tts-2.0");
      } catch {
        voiceKeyToUse = "jasper";
      }

      const idempotencyKey = deterministicUuid(
        [
          "script-batch-voice-v1",
          script.id,
          block.id,
          voiceModel.id,
          voiceModel.priceVersions[0].id,
          voiceKeyToUse,
          String(speechRateToUse),
          block.text,
        ].join("\u0000"),
      );

      try {
        const job = await createVoiceJob(session.user.id, {
          organizationId: script.organizationId,
          projectId: script.projectId,
          modelId: voiceModel.id,
          priceVersionId: voiceModel.priceVersions[0].id,
          idempotencyKey,
          text: block.text,
          voiceKey: voiceKeyToUse,
          speechRate: speechRateToUse,
          format: "mp3",
        });

        queuedJobs.push({ blockId: block.id, jobId: job.id });

        const idx = updatedScenes.findIndex((s) => s.id === block.id);
        const targetScene = updatedScenes[idx];
        if (idx !== -1 && targetScene) {
          updatedScenes[idx] = {
            ...targetScene,
            audioJobId: job.id,
            voiceKey: voiceKeyToUse,
          };
        }
      } catch (error) {
        failedBlocks.push({
          blockId: block.id,
          error:
            error instanceof Error
              ? error.message
              : "Voice synthesis could not be queued.",
        });
      }
    }

    if (queuedJobs.length > 0) {
      await db.script.update({
        where: { id: scriptId },
        data: {
          content: {
            ...content,
            scenes: updatedScenes,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }

    const partial = failedBlocks.length > 0 && queuedJobs.length > 0;
    const status = failedBlocks.length === 0 ? 202 : partial ? 207 : 422;

    return NextResponse.json(
      {
        jobs: queuedJobs,
        queuedCount: queuedJobs.length,
        failed: failedBlocks,
        failedCount: failedBlocks.length,
        partial,
      },
      { status },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid batch parameters.", issues: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Batch voice synthesis failed.",
      },
      { status: 500 },
    );
  }
}
