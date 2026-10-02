import { hasOrganizationPermission } from "@aiwa/authz";
import { db, type Prisma } from "@aiwa/db";
import { createVoiceJob, GenerationError } from "@aiwa/generation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { deterministicUuid } from "@/lib/idempotency";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const synthesizeSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  voiceKey: z.string().trim().min(1).max(100).default("jasper"),
  speechRate: z.number().min(0.5).max(2).default(1),
  blockId: z.string().trim().min(1).max(64).optional(),
});

type ScriptContent = {
  scenes?: Array<Record<string, unknown>>;
  voiceAssignments?: Record<string, unknown>;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ scriptId: string }> },
) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const { scriptId } = await params;

  try {
    const scriptRow = await db.script.findUnique({ where: { id: scriptId } });
    if (!scriptRow)
      return NextResponse.json({ error: "Script not found." }, { status: 404 });

    const membership = await db.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: scriptRow.organizationId,
          userId: session.user.id,
        },
      },
      include: { organization: true },
    });
    if (
      !membership ||
      membership.organization.status !== "ACTIVE" ||
      !hasOrganizationPermission(membership.role, "generation:create")
    )
      return NextResponse.json({ error: "Access denied." }, { status: 403 });

    const input = synthesizeSchema.parse(await request.json());
    if (input.blockId) {
      const content = (scriptRow.content as ScriptContent) || {};
      const block = content.scenes?.find((scene) => scene.id === input.blockId);
      if (!block || block.type !== "dialogue" || block.text !== input.text)
        return NextResponse.json(
          {
            error:
              "The screenplay line changed. Reload it before synthesizing audio.",
          },
          { status: 409 },
        );
    }

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
    const price = voiceModel?.priceVersions[0];
    if (!voiceModel || !price)
      return NextResponse.json(
        { error: "Seed Speech TTS 2.0 is not configured." },
        { status: 503 },
      );

    const idempotencyKey = deterministicUuid(
      [
        "script-line-voice-v2",
        scriptId,
        input.blockId ?? "adhoc",
        voiceModel.id,
        price.id,
        input.voiceKey,
        String(input.speechRate),
        input.text,
      ].join("\u0000"),
    );
    const job = await createVoiceJob(session.user.id, {
      organizationId: scriptRow.organizationId,
      projectId: scriptRow.projectId,
      modelId: voiceModel.id,
      priceVersionId: price.id,
      idempotencyKey,
      text: input.text,
      voiceKey: input.voiceKey,
      speechRate: input.speechRate,
      format: "mp3",
    });

    let revision = scriptRow.revision;
    if (input.blockId) {
      const patch = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM Script WHERE id = ${scriptId} FOR UPDATE`;
        const current = await tx.script.findUniqueOrThrow({
          where: { id: scriptId },
        });
        const content = (current.content as ScriptContent) || {};
        const scenes = Array.isArray(content.scenes) ? content.scenes : [];
        let attached = false;
        const updatedScenes = scenes.map((scene) => {
          if (
            scene.id === input.blockId &&
            scene.type === "dialogue" &&
            scene.text === input.text
          ) {
            attached = true;
            return {
              ...scene,
              audioJobId: job.id,
              voiceKey: input.voiceKey,
            };
          }
          return scene;
        });
        if (!attached) return { attached: false, revision: current.revision };
        const updated = await tx.script.update({
          where: { id: scriptId },
          data: {
            content: {
              ...content,
              scenes: updatedScenes,
            } as Prisma.InputJsonValue,
            revision: { increment: 1 },
          },
          select: { revision: true },
        });
        return { attached: true, revision: updated.revision };
      });
      revision = patch.revision;
      if (!patch.attached)
        return NextResponse.json(
          {
            error:
              "Audio was queued, but the screenplay line changed before it could be attached. Reload the script; no edit was overwritten.",
            jobId: job.id,
            status: job.status,
            revision,
          },
          { status: 409 },
        );
    }

    return NextResponse.json(
      {
        jobId: job.id,
        status: job.status,
        blockId: input.blockId,
        revision,
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: "Invalid synthesis parameters.", issues: error.issues },
        { status: 400 },
      );
    if (error instanceof GenerationError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    return NextResponse.json(
      { error: "Voice synthesis failed." },
      { status: 500 },
    );
  }
}
