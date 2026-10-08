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

const brandGenerateSchema = z
  .object({
    organizationId: z.string().min(1),
    brandName: z.string().min(1).max(100),
    industry: z.string().max(100).optional(),
    vision: z.string().max(1000).optional(),
    targetMarket: z.string().max(200).optional(),
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

const generatedBrandProfileSchema = z.object({
  tagline: z.string().max(200).default(""),
  voiceTone: z.string().max(1000).default(""),
  guidelines: z.string().max(5000).default(""),
  targetAudience: z.string().max(1000).default(""),
  vocabulary: z.array(z.string().min(1).max(100)).max(50).default([]),
});

const BRAND_STRATEGIST_SYSTEM_PROMPT = `You are an elite Brand Strategist and Creative Identity Architect.
Generate structured, distinctive brand voice and identity guidelines for the given brand.
You must return only a valid JSON object with the following keys:
{
  "tagline": "A punchy, memorable tagline",
  "voiceTone": "Detailed description of the brand voice (personality, temperament, syntax, pacing)",
  "guidelines": "Core brand messaging pillars, do's and don'ts, emotional resonance",
  "targetAudience": "Primary customer persona, motivations, values, and lifestyle",
  "vocabulary": ["5-10 key brand words or phrases that reflect the voice"]
}
Do not wrap in markdown fences. Return only raw valid JSON.`;

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
    const input = brandGenerateSchema.parse(await request.json());
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

    const selectedModel = await resolveStudioModelSelection(
      input.modelId ?? "seed-2-0-pro-260328",
      "brand-strategy",
    );
    const userPromptContent = `Brand Name: ${input.brandName}
${input.industry ? `Industry: ${input.industry}` : ""}
${input.vision ? `Vision / Mission: ${input.vision}` : ""}
${input.targetMarket ? `Target Market: ${input.targetMarket}` : ""}`;
    const messages = [
      { role: "system" as const, content: BRAND_STRATEGIST_SYSTEM_PROMPT },
      { role: "user" as const, content: userPromptContent },
    ];
    const maxTokens = 2048;

    if (input.mode === "quote") {
      const quote = await issueTextFeatureQuote({
        organizationId: input.organizationId,
        userId: session.user.id,
        modelId: selectedModel.id,
        messages,
        maxTokens,
        responseFormat: "json_object",
      });
      return NextResponse.json({ quote });
    }

    await assertQuotedTextModel(input.quotedModelId!, selectedModel.id);
    const job = await createTextJob(session.user.id, {
      organizationId: input.organizationId,
      modelId: input.quotedModelId,
      priceVersionId: input.priceVersionId,
      quoteToken: input.quoteToken,
      idempotencyKey: input.idempotencyKey,
      localeIntent: input.localeIntent,
      messages,
      temperature: 0.7,
      maxTokens,
      responseFormat: "json_object",
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
      parsedResult = generatedBrandProfileSchema.parse(JSON.parse(cleanJson));
    } catch {
      parsedResult = {
        tagline: "",
        voiceTone: result.content,
        guidelines: "",
        targetAudience: "",
        vocabulary: [],
      };
    }
    return NextResponse.json({
      profile: parsedResult,
      rawContent: result.content,
      chargedCredits: result.chargedCredits,
      jobId: result.jobId,
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: "Invalid brand generation parameters.", issues: error.issues },
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
      { error: "Brand generation failed." },
      { status: 502 },
    );
  }
}
