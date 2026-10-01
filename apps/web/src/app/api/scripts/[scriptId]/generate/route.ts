import { randomUUID } from "node:crypto";
import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { executeTextGeneration, GenerationError } from "@aiwa/generation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const scriptGenerateSchema = z.object({
  prompt: z.string().min(1).max(2000),
  action: z
    .enum(["continue", "dialogue", "polish", "scene"])
    .default("dialogue"),
  currentScene: z.string().max(4000).optional(),
  targetTone: z.string().max(200).optional(),
  modelId: z.string().min(1).max(100).optional(),
});

const SCRIPTWRITER_SYSTEM_PROMPT = `You are an expert Hollywood and commercial screenplay writer and script consultant.
Write sharp, formatted screenplay lines following standard screenplay format conventions:
- SCENE HEADINGS: e.g. INT. SALALAH MOUNTAIN LODGE - DUSK
- ACTION: Concise, visual, present tense
- CHARACTER NAME (in UPPERCASE)
- (parenthetical emotion/delivery if needed)
- Dialogue lines that sound natural, rhythmic, and authentic.
Do not use verbose introductory explanations. Return only the script scenes or dialogue requested.`;

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
    const input = scriptGenerateSchema.parse(json);

    const preferredModel = input.modelId || "seed-2-0-lite-260428";
    const now = new Date();
    let model = await db.providerModel.findFirst({
      where: {
        provider: "BYTEPLUS",
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
      model = await db.providerModel.findFirst({
        where: { provider: "BYTEPLUS", mediaKind: "TEXT", enabled: true },
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

    const userPromptContent = [
      `Script Title: ${script.title}`,
      script.logline ? `Logline: ${script.logline}` : null,
      input.targetTone ? `Target Tone: ${input.targetTone}` : null,
      input.currentScene
        ? `Current Scene Context:\n${input.currentScene}`
        : null,
      `Action: ${input.action.toUpperCase()}`,
      `Instruction: ${input.prompt}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const idempotencyKey = randomUUID();
    const genResult = await executeTextGeneration(session.user.id, {
      organizationId: script.organizationId,
      projectId: script.projectId,
      modelId: model.id,
      priceVersionId: model.priceVersions[0].id,
      idempotencyKey,
      messages: [
        { role: "system", content: SCRIPTWRITER_SYSTEM_PROMPT },
        { role: "user", content: userPromptContent },
      ],
      temperature: 0.75,
      maxTokens: 2048,
    });

    return NextResponse.json({
      content: genResult.content,
      usage: genResult.usage,
      chargedCredits: genResult.chargedCredits,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid screenplay generation parameters.",
          issues: error.issues,
        },
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
      { error: "Script generation failed." },
      { status: 502 },
    );
  }
}
