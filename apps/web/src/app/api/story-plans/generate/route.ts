import { randomUUID } from "node:crypto";
import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { executeTextGeneration, GenerationError } from "@aiwa/generation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const storyGenerateSchema = z.object({
  organizationId: z.string().min(1),
  title: z.string().min(1).max(100),
  premise: z.string().min(1).max(2000),
  genre: z.string().max(100).optional(),
  structureType: z
    .enum(["THREE_ACT", "FIVE_ACT", "HEROS_JOURNEY"])
    .default("THREE_ACT"),
  modelId: z.string().optional(),
});

const STORY_ARCHITECT_SYSTEM_PROMPT = `You are a master Narrative Designer and Story Architect.
Generate a structured story outline with beats and characters based on the user's premise.
Return ONLY a valid JSON object matching this schema:
{
  "beats": [
    {
      "act": "Act 1: Setup",
      "beat": "Opening Image & Normal World",
      "summary": "Description of the scene and emotional state",
      "conflict": "Initial tension"
    },
    {
      "act": "Act 1: Inciting Incident",
      "beat": "The Call to Action",
      "summary": "Disruption of the status quo",
      "conflict": "First major obstacle"
    },
    {
      "act": "Act 2: Rising Action",
      "beat": "Tests and Allies",
      "summary": "Exploring the new world and building stakes",
      "conflict": "Escalating stakes"
    },
    {
      "act": "Act 2: Midpoint",
      "beat": "Shift from Defense to Offense",
      "summary": "A false victory or false defeat that raises the stakes",
      "conflict": "Pivotal revelation"
    },
    {
      "act": "Act 2: Crisis",
      "beat": "All Is Lost",
      "summary": "The darkest hour before the breakthrough",
      "conflict": "Internal or external collapse"
    },
    {
      "act": "Act 3: Climax",
      "beat": "Final Confrontation",
      "summary": "The ultimate test using what was learned",
      "conflict": "Ultimate confrontation"
    },
    {
      "act": "Act 3: Resolution",
      "beat": "New Equilibrium",
      "summary": "The transformed world and character",
      "conflict": "Resolution"
    }
  ],
  "characters": [
    {
      "name": "Character name",
      "role": "Protagonist / Antagonist / Mentor / Ally",
      "motivation": "Core desire",
      "flaw": "Fatal flaw or internal struggle"
    }
  ]
}
Do not wrap in markdown fences or explain. Return only valid JSON.`;

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
    const input = storyGenerateSchema.parse(json);

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
      model = await db.providerModel.findFirst({
        where: { mediaKind: "TEXT", enabled: true },
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

    const userPromptContent = `Story Title: ${input.title}
Genre: ${input.genre || "Drama / Cinematic"}
Structure: ${input.structureType}
Premise: ${input.premise}`;

    const idempotencyKey = randomUUID();
    const genResult = await executeTextGeneration(session.user.id, {
      organizationId: input.organizationId,
      modelId: model.id,
      priceVersionId: model.priceVersions[0].id,
      idempotencyKey,
      messages: [
        { role: "system", content: STORY_ARCHITECT_SYSTEM_PROMPT },
        { role: "user", content: userPromptContent },
      ],
      temperature: 0.7,
      maxTokens: 3000,
    });

    let parsedResult;
    try {
      const cleanJson = genResult.content
        .replace(/^```json\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      parsedResult = JSON.parse(cleanJson);
    } catch {
      parsedResult = {
        beats: [
          {
            act: "Act 1",
            beat: "Outline",
            summary: genResult.content,
            conflict: "",
          },
        ],
        characters: [],
      };
    }

    return NextResponse.json({
      beats: parsedResult.beats ?? [],
      characters: parsedResult.characters ?? [],
      rawContent: genResult.content,
      chargedCredits: genResult.chargedCredits,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid story plan generation parameters.",
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
      { error: "Story plan generation failed." },
      { status: 502 },
    );
  }
}
