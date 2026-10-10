import { hasOrganizationPermission } from "@aiwa/authz";
import { db, Prisma } from "@aiwa/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  creativeLocaleIntentSchema,
  normalizeCreativeLocaleIntent,
} from "@aiwa/generation/locale";

import { getRequestSession } from "@/lib/request-auth";
import {
  admitReasoningJob,
  ReasoningAdmissionError,
} from "@/lib/reasoning-admission";
import { rateLimit } from "@/lib/rate-limit";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import {
  getAvailableStudioModels,
  selectStudioModelBySelection,
  StudioModelUnavailableError,
} from "@/lib/studio-model-discovery";

const reasoningLimiter = rateLimit({
  max: 20,
  windowMs: 60_000,
  prefix: "reasoning",
});

function promptEnhancementSystemPrompt(targetMedia: "IMAGE" | "VIDEO" | "VOICE") {
  if (targetMedia === "VOICE")
    return [
      "You are an expert editor for text that will be spoken aloud by text-to-speech.",
      "Polish clarity, natural spoken cadence, grammar and punctuation while preserving all user facts, names, quantities, intent and language.",
      "Return only speakable narration: never add headings, stage directions, markdown, explanations, bracketed sound cues or text that should not be spoken.",
      'Return only one JSON object with exactly one string property named "enhancedPrompt". Do not use markdown fences or commentary.',
      "Keep enhancedPrompt at or below 4096 characters.",
    ].join(" ");
  return [
    `You are an expert creative director for AI ${targetMedia === "VIDEO" ? "video" : "image"} generation.`,
    targetMedia === "VIDEO"
      ? "Improve the prompt with concrete subject, action, composition, shot progression, camera movement, lighting, atmosphere, pacing, and style details when useful."
      : "Improve the prompt with concrete subject, composition, lighting, lens or camera language, atmosphere, materials, and style details when useful.",
    "Preserve the user's intent and factual constraints. Do not add unrelated subjects, brands, people, claims, text, or sensitive attributes.",
    'Return only one JSON object with exactly one string property named "enhancedPrompt". Do not use markdown fences or commentary.',
    "Keep enhancedPrompt at or below 2000 characters.",
  ].join(" ");
}

const requestSchema = z
  .object({
    organizationId: z.string().min(1).max(191),
    userPrompt: z.string().trim().min(1).max(4096),
    targetMedia: z.enum(["IMAGE", "VIDEO", "VOICE"]),
    idempotencyKey: z.uuid(),
    modelId: z.string().min(1).max(191).optional(),
    localeIntent: creativeLocaleIntentSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.targetMedia !== "VOICE" && value.userPrompt.length > 2000)
      ctx.addIssue({ code: "custom", path: ["userPrompt"], message: "Prompt exceeds 2000 characters." });
  });

function publicModel(model: {
  id: string;
  provider: string;
  providerModelId: string;
  displayName?: string;
  name?: string;
}) {
  return {
    id: model.id,
    provider: model.provider,
    providerModelId: model.providerModelId,
    name: model.displayName ?? model.name ?? model.providerModelId,
  };
}

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

async function existingResponse(
  idempotencyKey: string,
  organizationId: string,
  userPrompt: string,
  targetMedia: "IMAGE" | "VIDEO" | "VOICE",
  requestedModelId?: string,
  localeIntent?: unknown,
) {
  const existing = await db.reasoningJob.findUnique({
    where: { idempotencyKey },
    include: {
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
  if (!existing) return null;

  const payload = existing.requestPayload as {
    task?: unknown;
    userPrompt?: unknown;
    targetMedia?: unknown;
    localeIntent?: unknown;
  };
  const sameModel =
    requestedModelId === undefined ||
    requestedModelId === existing.providerModel.id ||
    requestedModelId === existing.providerModel.providerModelId;
  if (
    existing.organizationId !== organizationId ||
    payload.task !== "prompt-enhancement" ||
    payload.userPrompt !== userPrompt ||
    payload.targetMedia !== targetMedia ||
    JSON.stringify(payload.localeIntent ?? null) !==
      JSON.stringify(localeIntent ?? null) ||
    !sameModel
  )
    return NextResponse.json(
      { error: "Idempotency key was already used for different inputs." },
      { status: 409 },
    );

  return NextResponse.json(
    {
      jobId: existing.id,
      status: existing.status,
      model: publicModel(existing.providerModel),
    },
    { status: 202 },
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

  const rateLimited = await reasoningLimiter.check(session.user.id);
  if (rateLimited) return rateLimited;

  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 20_000)
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
      select: {
        role: true,
        organization: { select: { status: true } },
      },
    });

    if (
      !membership ||
      membership.organization.status !== "ACTIVE" ||
      !hasOrganizationPermission(membership.role, "generation:create")
    )
      return NextResponse.json({ error: "Access denied." }, { status: 403 });

    const idempotencyKey = `reasoning:${session.user.id}:${parsed.idempotencyKey}`;
    const previous = await existingResponse(
      idempotencyKey,
      parsed.organizationId,
      parsed.userPrompt,
      parsed.targetMedia,
      parsed.modelId,
      parsed.localeIntent
        ? normalizeCreativeLocaleIntent(parsed.localeIntent)
        : undefined,
    );
    if (previous) return previous;

    const discovery = await getAvailableStudioModels("prompt-enhancement");
    if (discovery.models.length === 0)
      return NextResponse.json(
        { error: "Prompt enhancement is not configured." },
        { status: 503 },
      );

    let selected;
    try {
      selected = parsed.modelId
        ? selectStudioModelBySelection(discovery, parsed.modelId)
        : selectStudioModelBySelection(
            discovery,
            discovery.defaultModelId ?? discovery.models[0]!.id,
          );
    } catch (error) {
      if (error instanceof StudioModelUnavailableError)
        return NextResponse.json({ error: error.message }, { status: 409 });
      throw error;
    }

    try {
      const { job } = await admitReasoningJob({
        organizationId: parsed.organizationId,
        userId: session.user.id,
        providerModelId: selected.id,
        priceVersionId: selected.pricing.priceVersionId,
        idempotencyKey,
        userPrompt: parsed.userPrompt,
        targetMedia: parsed.targetMedia,
        localeIntent: parsed.localeIntent,
        systemPrompt: promptEnhancementSystemPrompt(parsed.targetMedia),
      });

      return NextResponse.json(
        {
          jobId: job.id,
          status: job.status,
          model: publicModel({
            ...selected,
            displayName: selected.name,
          }),
        },
        { status: 202 },
      );
    } catch (error) {
      if (error instanceof ReasoningAdmissionError) {
        const headers: Record<string, string> = {};
        if (error.retryAfterSeconds > 0)
          headers["Retry-After"] = String(error.retryAfterSeconds);
        return NextResponse.json(
          { error: error.message },
          { status: error.status, headers },
        );
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const raced = await existingResponse(
          idempotencyKey,
          parsed.organizationId,
          parsed.userPrompt,
          parsed.targetMedia,
          parsed.modelId,
          parsed.localeIntent
            ? normalizeCreativeLocaleIntent(parsed.localeIntent)
            : undefined,
        );
        if (raced) return raced;
      }
      throw error;
    }
  } catch (error) {
    return failure(error);
  }
}
