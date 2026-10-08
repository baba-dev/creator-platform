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

const directorChatSchema = z
  .object({
    organizationId: z.string().min(1),
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant", "system"]),
          content: z.string().min(1).max(5000),
        }),
      )
      .min(1)
      .max(49),
    modelId: z.string().min(1).max(100).optional(),
    temperature: z.number().min(0).max(2).optional(),
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
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  try {
    const input = directorChatSchema.parse(await request.json());
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
      input.modelId ?? "dola-seed-2-1-turbo-260628",
      "creative-director",
    );
    const messages = [
      { role: "system" as const, content: DIRECTOR_SYSTEM_PROMPT },
      ...input.messages,
    ];
    const maxTokens = 2500;
    const temperature = input.temperature ?? 0.7;

    if (input.mode === "quote") {
      const quote = await issueTextFeatureQuote({
        organizationId: input.organizationId,
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
      organizationId: input.organizationId,
      modelId: input.quotedModelId,
      priceVersionId: input.priceVersionId,
      quoteToken: input.quoteToken,
      idempotencyKey: input.idempotencyKey,
      localeIntent: input.localeIntent,
      messages,
      temperature,
      maxTokens,
    });
    const result = textResultFromJob(job);
    if (!result)
      return NextResponse.json(
        { jobId: job.id, status: job.status, pending: true },
        { status: 202 },
      );
    return NextResponse.json({
      role: "assistant",
      content: result.content,
      usage: result.usage,
      chargedCredits: result.chargedCredits,
      jobId: result.jobId,
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: "Invalid director request.", issues: error.issues },
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
      { error: "Director request failed." },
      { status: 502 },
    );
  }
}
