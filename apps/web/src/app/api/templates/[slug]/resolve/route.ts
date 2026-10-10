import { db } from "@aiwa/db";
import { priceCredits } from "@aiwa/generation";
import { creativeLocaleIntentSchema } from "@aiwa/generation/locale";
import { resolveTemplateSchema } from "@aiwa/validation";
import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import {
  modelSupportsTemplate,
  parseTemplateDefaults,
  parseTemplateVariables,
  resolveTemplatePrompt,
} from "@/lib/templates";

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  const { slug } = await context.params;
  const parsed = resolveTemplateSchema
    .extend({ localeIntent: creativeLocaleIntentSchema.optional() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid template input." },
      { status: 400 },
    );

  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: parsed.data.organizationId,
        userId: session.user.id,
      },
    },
    select: { id: true },
  });
  if (!membership)
    return NextResponse.json(
      { error: "Workspace access denied." },
      { status: 403 },
    );

  const template = await db.generationTemplate.findFirst({
    where: {
      slug,
      status: "PUBLISHED",
      mediaKind: { in: ["IMAGE", "VIDEO", "VOICE"] },
    },
  });
  if (!template)
    return NextResponse.json({ error: "Template not found." }, { status: 404 });

  try {
    const variables = parseTemplateVariables(template.variables);
    const defaults = parseTemplateDefaults(template.defaultInput);
    const resolved = resolveTemplatePrompt(
      template.promptTemplate,
      variables,
      parsed.data.values,
      template.mediaKind as "IMAGE" | "VIDEO" | "VOICE",
    );

    if (resolved.referenceAssetIds.length) {
      const assets = await db.asset.count({
        where: {
          id: { in: resolved.referenceAssetIds },
          organizationId: parsed.data.organizationId,
          storageOwnerUserId: session.user.id,
          purpose: "REFERENCE_INPUT",
          mediaKind: "IMAGE",
          status: "READY",
        },
      });
      if (assets !== resolved.referenceAssetIds.length) {
        return NextResponse.json(
          { error: "One or more reference images are unavailable." },
          { status: 400 },
        );
      }
    }

    const now = new Date();
    const models = await db.providerModel.findMany({
      where: {
        enabled: true,
        provider: "BYTEPLUS",
        mediaKind: template.mediaKind,
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

    const compatible = models.filter(
      (model) =>
        model.priceVersions[0] &&
        modelSupportsTemplate(
          model,
          template.mediaKind as "IMAGE" | "VIDEO" | "VOICE",
          defaults,
          resolved.referenceAssetIds.length,
        ),
    );
    compatible.sort((a, b) => {
      const ap = a.providerModelId === template.preferredModelId ? 0 : 1;
      const bp = b.providerModelId === template.preferredModelId ? 0 : 1;
      return ap - bp || a.displayName.localeCompare(b.displayName);
    });

    const model = compatible[0];
    const price = model?.priceVersions[0];
    if (!model || !price) {
      return NextResponse.json(
        { error: "No enabled model currently supports this template." },
        { status: 409 },
      );
    }

    const outputCount =
      template.mediaKind === "IMAGE" ? (defaults.outputCount ?? 1) : 1;
    const estimatedCredits =
      template.mediaKind === "IMAGE"
        ? (priceCredits(price) * BigInt(outputCount)).toString()
        : null;

    return NextResponse.json(
      {
        resolved: {
          templateId: template.id,
          templateSlug: template.slug,
          templateName: template.name,
          mediaKind: template.mediaKind,
          prompt: resolved.prompt,
          localeIntent: parsed.data.localeIntent,
          referenceAssetIds: resolved.referenceAssetIds,
          defaults,
          modelId: model.id,
          priceVersionId: price.id,
          estimatedCredits,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Template could not be resolved.",
      },
      { status: 400 },
    );
  }
}
