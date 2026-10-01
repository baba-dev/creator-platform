import { randomUUID } from "node:crypto";
import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { executeTextGeneration, GenerationError } from "@aiwa/generation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const brandGenerateSchema = z.object({
  organizationId: z.string().min(1),
  brandName: z.string().min(1).max(100),
  industry: z.string().max(100).optional(),
  vision: z.string().max(1000).optional(),
  targetMarket: z.string().max(200).optional(),
  modelId: z.string().min(1).max(100).optional(),
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
    const input = brandGenerateSchema.parse(json);

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

    const preferredModel = input.modelId || "seed-2-0-pro-260328";
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

    const userPromptContent = `Brand Name: ${input.brandName}
${input.industry ? `Industry: ${input.industry}` : ""}
${input.vision ? `Vision / Mission: ${input.vision}` : ""}
${input.targetMarket ? `Target Market: ${input.targetMarket}` : ""}`;

    const idempotencyKey = randomUUID();
    const genResult = await executeTextGeneration(session.user.id, {
      organizationId: input.organizationId,
      modelId: model.id,
      priceVersionId: model.priceVersions[0].id,
      idempotencyKey,
      messages: [
        { role: "system", content: BRAND_STRATEGIST_SYSTEM_PROMPT },
        { role: "user", content: userPromptContent },
      ],
      temperature: 0.7,
      maxTokens: 2048,
    });

    let parsedResult;
    try {
      const cleanJson = genResult.content
        .replace(/^```json\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      parsedResult = generatedBrandProfileSchema.parse(JSON.parse(cleanJson));
    } catch {
      parsedResult = {
        tagline: "",
        voiceTone: genResult.content,
        guidelines: "",
        targetAudience: "",
        vocabulary: [],
      };
    }

    return NextResponse.json({
      profile: parsedResult,
      rawContent: genResult.content,
      chargedCredits: genResult.chargedCredits,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid brand generation parameters.", issues: error.issues },
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
      { error: "Brand generation failed." },
      { status: 502 },
    );
  }
}
