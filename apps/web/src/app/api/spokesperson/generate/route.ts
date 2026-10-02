import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@aiwa/db";
import {
  createVideoJob,
  createVoiceJob,
  requireMembership,
} from "@aiwa/generation";
import {
  isBytePlusVisionConfigured,
  isBytePlusVoiceConfigured,
} from "@aiwa/providers/byteplus";
import { rateLimit } from "@/lib/rate-limit";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const generationLimiter = rateLimit({
  max: 10,
  windowMs: 60_000,
  prefix: "spokesperson-generation",
});

const generateSchema = z
  .object({
    organizationId: z.string().min(1).max(100),
    projectId: z.string().min(1).max(100).nullable().optional(),
    avatarAssetId: z.string().min(1).max(100),
    resolution: z.enum(["720p", "1080p"]).default("720p"),
    motionPrompt: z.string().trim().max(1000).optional(),
    idempotencyKey: z.string().uuid(),
    audioMode: z.enum(["SCRIPT", "AUDIO_ASSET"]).default("SCRIPT"),
    script: z.string().trim().min(1).max(1000).optional(),
    voiceKey: z.string().trim().min(1).max(100).default("charlotte"),
    speechRate: z.number().min(0.5).max(2.0).default(1.0),
    drivingAudioAssetId: z.string().min(1).max(100).optional(),
  })
  .refine(
    (data) => {
      if (data.audioMode === "SCRIPT") {
        return Boolean(data.script && data.script.trim().length > 0);
      }
      return Boolean(data.drivingAudioAssetId);
    },
    {
      message:
        "Either a non-empty script (for SCRIPT mode) or drivingAudioAssetId (for AUDIO_ASSET mode) is required.",
    },
  );

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

  const rateLimited = await generationLimiter.check(session.user.id);
  if (rateLimited) return rateLimited;

  try {
    const raw = await request.json();
    const payload = generateSchema.parse(raw);

    await requireMembership(db, payload.organizationId, session.user.id, true);

    // OmniHuman 1.5 model check
    if (!isBytePlusVisionConfigured()) {
      return NextResponse.json(
        { error: "OmniHuman generation is not configured." },
        { status: 503 },
      );
    }

    const omniModel = await db.providerModel.findFirst({
      where: {
        provider: "BYTEPLUS",
        providerModelId: "omnihuman-1.5",
        enabled: true,
      },
      include: {
        priceVersions: {
          where: { effectiveTo: null },
          orderBy: { effectiveFrom: "desc" },
          take: 1,
        },
      },
    });

    if (!omniModel || !omniModel.priceVersions[0]) {
      return NextResponse.json(
        {
          error:
            "OmniHuman 1.5 model is not available or active price is unconfigured.",
        },
        { status: 400 },
      );
    }

    // Audio file mode -> Submit OmniHuman 1.5 video job directly
    if (payload.audioMode === "AUDIO_ASSET" && payload.drivingAudioAssetId) {
      const videoJob = await createVideoJob(session.user.id, {
        schemaVersion: 2,
        workflow: "TALKING_AVATAR",
        organizationId: payload.organizationId,
        projectId: payload.projectId ?? undefined,
        modelId: omniModel.id,
        priceVersionId: omniModel.priceVersions[0].id,
        idempotencyKey: payload.idempotencyKey,
        prompt: payload.motionPrompt ?? "",
        sources: [
          { assetId: payload.avatarAssetId, role: "AVATAR_IMAGE", position: 0 },
          {
            assetId: payload.drivingAudioAssetId,
            role: "DRIVING_AUDIO",
            position: 1,
          },
        ],
        aspectRatio: "adaptive",
        resolution: payload.resolution,
        durationSeconds: -1,
        generateAudio: false,
        outputFormat: "mp4",
        returnLastFrame: false,
      });

      return NextResponse.json(
        {
          jobId: videoJob.id,
          status: "QUEUED",
          stage: "VIDEO",
        },
        { status: 202 },
      );
    }

    // Script mode -> Synthesize speech via Seed-TTS 2.0
    if (!isBytePlusVoiceConfigured()) {
      return NextResponse.json(
        { error: "Voice generation is not configured." },
        { status: 503 },
      );
    }

    const voiceModel = await db.providerModel.findFirst({
      where: {
        provider: "BYTEPLUS",
        providerModelId: "seed-tts-2.0",
        enabled: true,
      },
      include: {
        priceVersions: {
          where: { effectiveTo: null },
          orderBy: { effectiveFrom: "desc" },
          take: 1,
        },
      },
    });

    if (!voiceModel || !voiceModel.priceVersions[0]) {
      return NextResponse.json(
        {
          error:
            "Seed Speech TTS 2.0 model is not available or active price is unconfigured.",
        },
        { status: 400 },
      );
    }

    const voiceJob = await createVoiceJob(session.user.id, {
      organizationId: payload.organizationId,
      projectId: payload.projectId ?? undefined,
      modelId: voiceModel.id,
      priceVersionId: voiceModel.priceVersions[0].id,
      idempotencyKey: payload.idempotencyKey,
      text: payload.script!,
      voiceKey: payload.voiceKey,
      speechRate: payload.speechRate,
      format: "mp3",
    });

    return NextResponse.json(
      {
        voiceJobId: voiceJob.id,
        status: "QUEUED",
        stage: "AUDIO",
        omniHumanModelId: omniModel.id,
        omniHumanPriceVersionId: omniModel.priceVersions[0].id,
      },
      { status: 202 },
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request payload.", details: err.flatten() },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "Internal error";
    const status =
      message.includes("Forbidden") || message.includes("permission")
        ? 403
        : message.includes("not found")
          ? 404
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
