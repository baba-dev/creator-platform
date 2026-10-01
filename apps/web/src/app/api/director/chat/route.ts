import { randomUUID } from "node:crypto";
import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { executeTextGeneration, GenerationError } from "@aiwa/generation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const directorChatSchema = z.object({
  organizationId: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().min(1).max(5000),
      }),
    )
    .min(1),
  modelId: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const DIRECTOR_SYSTEM_PROMPT = `You are the Lead Creative Director at Aiwa Creator, an elite AI media studio.
Your role is to guide creators from raw ideas into production-ready creative assets across Image, Video, and Speech studios.

When brainstorming or refining ideas:
1. Provide a sharp, inspiring creative concept (Theme, Atmosphere, Visual Style, Audio Tone).
2. Generate ready-to-use production prompts clearly formatted so the creator can copy or dispatch them directly:
   - For Image: [IMAGE PROMPT] detailed prompt with subject, composition, lighting, style, lens details.
   - For Video: [VIDEO PROMPT] prompt with subject motion, camera movement, temporal progression, aspect ratio.
   - For Speech: [VOICE SCRIPT] evocative dialogue or narration with recommended tone and pacing.
3. Be concise, actionable, and visually evocative. Ground concepts in high production value.`;

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
    const json = await request.json();
    const input = directorChatSchema.parse(json);

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

    const preferredModel = input.modelId || "dola-seed-2-1-turbo-260628";
    const now = new Date();
    let model = await db.providerModel.findFirst({
      where: {
        providerModelId: preferredModel,
        mediaKind: "TEXT",
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

    if (!model || !model.priceVersions[0]) {
      // Fallback to any enabled text model
      model = await db.providerModel.findFirst({
        where: {
          mediaKind: "TEXT",
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
    }

    if (!model || !model.priceVersions[0]) {
      return NextResponse.json(
        { error: "No text models are currently enabled." },
        { status: 503 },
      );
    }

    const messagesPayload: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [
      { role: "system", content: DIRECTOR_SYSTEM_PROMPT },
      ...input.messages,
    ];

    const idempotencyKey = randomUUID();
    const genResult = await executeTextGeneration(session.user.id, {
      organizationId: input.organizationId,
      modelId: model.id,
      priceVersionId: model.priceVersions[0].id,
      idempotencyKey,
      messages: messagesPayload,
      temperature: input.temperature ?? 0.7,
      maxTokens: 2500,
    });

    return NextResponse.json({
      role: "assistant",
      content: genResult.content,
      usage: genResult.usage,
      chargedCredits: genResult.chargedCredits,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid director request.", issues: error.issues },
        { status: 400 },
      );
    }
    if (error instanceof GenerationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "Director request failed." },
      { status: 502 },
    );
  }
}
