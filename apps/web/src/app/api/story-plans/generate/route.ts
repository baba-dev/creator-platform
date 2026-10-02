import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import {
  createTextJob,
  GenerationError,
  textResultFromJob,
} from "@aiwa/generation";
import { storyStructureTypeSchema } from "@aiwa/validation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import {
  assertQuotedTextModel,
  issueTextFeatureQuote,
} from "@/lib/text-feature-generation";

const storyGenerateSchema = z
  .object({
    organizationId: z.string().min(1),
    title: z.string().min(1).max(100),
    premise: z.string().min(1).max(2000),
    genre: z.string().max(100).optional(),
    structureType: storyStructureTypeSchema.default("THREE_ACT"),
    modelId: z.string().min(1).max(100).optional(),
  mode: z.enum(["quote", "generate"]).default("generate"),
  idempotencyKey: z.uuid(),
  quoteToken: z.string().min(1).max(2048).optional(),
  quotedModelId: z.string().min(1).max(100).optional(),
  priceVersionId: z.string().min(1).max(100).optional(),
  })
  .superRefine((value, context) => {
  if (
    value.mode === "generate" &&
    (!value.quoteToken || !value.quotedModelId || !value.priceVersionId)
  ) {
    context.addIssue({
      code: "custom",
      message: "A fresh generation quote is required.",
    });
  }
});

const generatedStorySchema = z.object({
  beats: z
    .array(
      z.object({
        act: z.string().min(1).max(200),
        beat: z.string().min(1).max(200),
        summary: z.string().min(1).max(4000),
        conflict: z.string().max(2000).default(""),
      }),
    )
    .max(100),
  characters: z
    .array(
      z.object({
        name: z.string().min(1).max(160),
        role: z.string().max(160).default(""),
        motivation: z.string().max(2000).default(""),
        flaw: z.string().max(2000).default(""),
      }),
    )
    .max(100),
});

const STORY_ARCHITECT_SYSTEM_PROMPT = `You are a master Narrative Designer and Story Architect.
Generate a structured story outline with beats and characters based on the user's premise.
Return ONLY a valid JSON object matching this schema:
{
  "beats": [
    {"act":"Act 1: Setup","beat":"Opening Image & Normal World","summary":"Description of the scene and emotional state","conflict":"Initial tension"},
    {"act":"Act 1: Inciting Incident","beat":"The Call to Action","summary":"Disruption of the status quo","conflict":"First major obstacle"},
    {"act":"Act 2: Rising Action","beat":"Tests and Allies","summary":"Exploring the new world and building stakes","conflict":"Escalating stakes"},
    {"act":"Act 2: Midpoint","beat":"Shift from Defense to Offense","summary":"A false victory or false defeat that raises the stakes","conflict":"Pivotal revelation"},
    {"act":"Act 2: Crisis","beat":"All Is Lost","summary":"The darkest hour before the breakthrough","conflict":"Internal or external collapse"},
    {"act":"Act 3: Climax","beat":"Final Confrontation","summary":"The ultimate test using what was learned","conflict":"Ultimate confrontation"},
    {"act":"Act 3: Resolution","beat":"New Equilibrium","summary":"The transformed world and character","conflict":"Resolution"}
  ],
  "characters": [
    {"name":"Character name","role":"Protagonist / Antagonist / Mentor / Ally","motivation":"Core desire","flaw":"Fatal flaw or internal struggle"}
  ]
}
Do not wrap in markdown fences or explain. Return only valid JSON.`;

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  try {
    const input = storyGenerateSchema.parse(await request.json());
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
    )
      return NextResponse.json({ error: "Access denied." }, { status: 403 });

    const providerModelId =
      input.modelId || "dola-seed-2-1-turbo-260628";
    const userPromptContent = `Story Title: ${input.title}
Genre: ${input.genre || "Drama / Cinematic"}
Structure: ${input.structureType}
Premise: ${input.premise}`;
    const messages = [
      { role: "system" as const, content: STORY_ARCHITECT_SYSTEM_PROMPT },
      { role: "user" as const, content: userPromptContent },
    ];
    const maxTokens = 3000;

    if (input.mode === "quote") {
      const quote = await issueTextFeatureQuote({
        organizationId: input.organizationId,
        userId: session.user.id,
        providerModelId,
        messages,
        maxTokens,
      });
      return NextResponse.json({ quote });
    }

    await assertQuotedTextModel(input.quotedModelId!, providerModelId);
    const job = await createTextJob(session.user.id, {
      organizationId: input.organizationId,
      modelId: input.quotedModelId,
      priceVersionId: input.priceVersionId,
      quoteToken: input.quoteToken,
      idempotencyKey: input.idempotencyKey,
      messages,
      temperature: 0.7,
      maxTokens,
    });
    const result = textResultFromJob(job);
    if (!result)
      return NextResponse.json(
        { jobId: job.id, status: job.status, pending: true },
        { status: 202 },
      );

    let parsedResult;
    try {
      const cleanJson = result.content
        .replace(/^\`\`\`json\s*/i, "")
        .replace(/\`\`\`\s*$/i, "")
        .trim();
      parsedResult = generatedStorySchema.parse(JSON.parse(cleanJson));
    } catch {
      parsedResult = {
        beats: [
          {
            act: "Act 1",
            beat: "Outline",
            summary: result.content,
            conflict: "",
          },
        ],
        characters: [],
      };
    }
    return NextResponse.json({
      beats: parsedResult.beats ?? [],
      characters: parsedResult.characters ?? [],
      rawContent: result.content,
      chargedCredits: result.chargedCredits,
      jobId: result.jobId,
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        {
          error: "Invalid story plan generation parameters.",
          issues: error.issues,
        },
        { status: 400 },
      );
    if (error instanceof GenerationError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    return NextResponse.json(
      { error: "Story plan generation failed." },
      { status: 502 },
    );
  }
}
