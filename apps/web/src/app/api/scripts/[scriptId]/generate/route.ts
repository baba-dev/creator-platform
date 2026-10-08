import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import {
  createTextJob,
  GenerationError,
  textResultFromJob,
} from "@aiwa/generation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { creativeLocaleIntentSchema } from "@aiwa/generation/locale";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import {
  assertQuotedTextModel,
  issueTextFeatureQuote,
} from "@/lib/text-feature-generation";
import {
  resolveStudioModelSelection,
  StudioModelUnavailableError,
} from "@/lib/studio-model-discovery";

const scriptGenerateSchema = z
  .object({
    prompt: z.string().min(1).max(2000),
    action: z
      .enum(["continue", "dialogue", "polish", "scene"])
      .default("dialogue"),
    currentScene: z.string().max(4000).optional(),
    targetTone: z.string().max(200).optional(),
    modelId: z.string().min(1).max(100).optional(),
    mode: z.enum(["quote", "generate"]).default("generate"),
    idempotencyKey: z.uuid(),
    localeIntent: creativeLocaleIntentSchema.optional(),
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

    const input = scriptGenerateSchema.parse(await request.json());
    const selectedModel = await resolveStudioModelSelection(
      input.modelId ?? "seed-2-0-lite-260428",
      "scriptwriting",
    );
    const userPromptContent = [
      `Script Title: ${scriptRow.title}`,
      scriptRow.logline ? `Logline: ${scriptRow.logline}` : null,
      input.targetTone ? `Target Tone: ${input.targetTone}` : null,
      input.currentScene
        ? `Current Scene Context:\n${input.currentScene}`
        : null,
      `Action: ${input.action.toUpperCase()}`,
      `Instruction: ${input.prompt}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    const messages = [
      { role: "system" as const, content: SCRIPTWRITER_SYSTEM_PROMPT },
      { role: "user" as const, content: userPromptContent },
    ];
    const maxTokens = 2048;

    if (input.mode === "quote") {
      const quote = await issueTextFeatureQuote({
        organizationId: scriptRow.organizationId,
        userId: session.user.id,
        modelId: selectedModel.id,
        messages,
        localeIntent: input.localeIntent,
        maxTokens,
      });
      return NextResponse.json({ quote });
    }

    await assertQuotedTextModel(input.quotedModelId!, selectedModel.id);
    const job = await createTextJob(session.user.id, {
      organizationId: scriptRow.organizationId,
      projectId: scriptRow.projectId,
      modelId: input.quotedModelId,
      priceVersionId: input.priceVersionId,
      quoteToken: input.quoteToken,
      idempotencyKey: input.idempotencyKey,
      localeIntent: input.localeIntent,
      messages,
      temperature: 0.75,
      maxTokens,
    });
    const result = textResultFromJob(job);
    if (!result)
      return NextResponse.json(
        { jobId: job.id, status: job.status, pending: true },
        { status: 202 },
      );
    return NextResponse.json({
      content: result.content,
      usage: result.usage,
      chargedCredits: result.chargedCredits,
      jobId: result.jobId,
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        {
          error: "Invalid screenplay generation parameters.",
          issues: error.issues,
        },
        { status: 400 },
      );
    if (error instanceof GenerationError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (error instanceof StudioModelUnavailableError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json(
      { error: "Script generation failed." },
      { status: 502 },
    );
  }
}
