import { db } from "@aiwa/db";
import {
  createImageJob,
  createVideoJob,
  createVoiceJob,
  imageModelIds,
  listPublicPresetVoices,
  priceCredits,
  requireMembership,
  videoModelIds,
  voiceModelIds,
} from "@aiwa/generation";
import {
  isBytePlusMediaConfigured,
  isBytePlusVisionConfigured,
  isBytePlusVoiceConfigured,
} from "@aiwa/providers/byteplus";
import { NextResponse } from "next/server";
import { z } from "zod";
import { generationError } from "@/lib/generation-api";
import {
  MEDIA_GENERATION_KINDS,
  mediaGenerationJobFilter,
} from "@/lib/media-generation-query";
import { rateLimit } from "@/lib/rate-limit";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const generationLimiter = rateLimit({
  max: 10,
  windowMs: 60_000,
  prefix: "generation",
});
export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  const rateLimited = await generationLimiter.check(session.user.id);
  if (rateLimited) return rateLimited;

  try {
    const text = await request.text();
    if (text.length > 24000)
      return NextResponse.json(
        { error: "Request too large." },
        { status: 413 },
      );
    const parsed = JSON.parse(text);
    const { modelId } = z
      .object({ modelId: z.string().min(1).max(100) })
      .parse(parsed);
    const model = await db.providerModel.findUnique({
      where: { id: modelId },
      select: { mediaKind: true, providerModelId: true },
    });
    if (!model)
      return NextResponse.json({ error: "Model not found." }, { status: 404 });
    if (
      model.mediaKind !== "IMAGE" &&
      model.mediaKind !== "VIDEO" &&
      model.mediaKind !== "VOICE"
    )
      return NextResponse.json(
        { error: "Model does not support Studio generation." },
        { status: 400 },
      );

    if (model.mediaKind === "VOICE") {
      if (!isBytePlusVoiceConfigured()) {
        return NextResponse.json(
          { error: "Voice generation is not configured." },
          { status: 503 },
        );
      }
    } else if (
      model.mediaKind === "VIDEO" &&
      model.providerModelId === "omnihuman-1.5"
    ) {
      if (!isBytePlusVisionConfigured()) {
        return NextResponse.json(
          { error: "OmniHuman generation is not configured." },
          { status: 503 },
        );
      }
    } else if (!isBytePlusMediaConfigured()) {
      return NextResponse.json(
        { error: "Media generation is not configured." },
        { status: 503 },
      );
    }

    const job =
      model.mediaKind === "VIDEO"
        ? await createVideoJob(session.user.id, parsed)
        : model.mediaKind === "VOICE"
          ? await createVoiceJob(session.user.id, parsed)
          : await createImageJob(session.user.id, parsed);
    return NextResponse.json(
      { jobId: job.id, status: job.status },
      { status: 202 },
    );
  } catch (error) {
    return generationError(error);
  }
}
export async function GET(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const searchParams = new URL(request.url).searchParams;
  const query = z
    .object({
      organizationId: z.string().min(1).max(100),
      kind: z.enum(MEDIA_GENERATION_KINDS).optional(),
    })
    .safeParse({
      organizationId: searchParams.get("organizationId") ?? "",
      kind: searchParams.get("kind") || undefined,
    });
  if (!query.success) {
    return NextResponse.json(
      { error: "Invalid generation history query." },
      { status: 400 },
    );
  }
  const { organizationId, kind } = query.data;
  try {
    const membership = await requireMembership(
      db,
      organizationId,
      session.user.id,
    );
    const now = new Date();
    const models = await db.providerModel.findMany({
      where: {
        enabled: true,
        provider: "BYTEPLUS",
        mediaKind: { in: ["IMAGE", "VIDEO", "VOICE"] },
        providerModelId: {
          in: [...imageModelIds, ...videoModelIds, ...voiceModelIds],
        },
      },
      orderBy: [{ mediaKind: "asc" }, { displayName: "asc" }],
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
    const [jobs, projects] = await Promise.all([
      db.generationJob.findMany({
        where: {
          organizationId,
          ...(membership.role === "ORGANIZATION_OWNER"
            ? {}
            : { createdById: session.user.id }),
          ...mediaGenerationJobFilter(kind),
        },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          status: true,
          errorMessage: true,
          reservedCredits: true,
          chargedCredits: true,
          quotedUnits: true,
          actualUnits: true,
          createdAt: true,
          requestPayload: true,
          providerModel: {
            select: {
              id: true,
              providerModelId: true,
              displayName: true,
              mediaKind: true,
            },
          },
          project: { select: { id: true, name: true } },
          assets: {
            where: { status: "READY", sourceType: "GENERATED" },
            orderBy: { generationOutputIndex: "asc" },
            select: {
              id: true,
              mimeType: true,
              generationOutputIndex: true,
            },
          },
        },
      }),
      db.project.findMany({
        where: { organizationId, archivedAt: null },
        orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
        select: { id: true, name: true },
      }),
    ]);
    const wallet = await db.wallet.findUnique({
      where: { organizationId },
      select: { balanceCache: true },
    });
    const mediaConfigured = isBytePlusMediaConfigured();
    const visionConfigured = isBytePlusVisionConfigured();
    const voiceConfigured = isBytePlusVoiceConfigured();
    return NextResponse.json(
      {
        configured: mediaConfigured || visionConfigured || voiceConfigured,
        mediaConfigured,
        visionConfigured,
        voiceConfigured,
        balance: wallet?.balanceCache.toString() ?? "0",
        models: models.flatMap((m) => {
          const configuredForModel =
            m.mediaKind === "VOICE"
              ? voiceConfigured
              : m.providerModelId === "omnihuman-1.5"
                ? visionConfigured
                : mediaConfigured;
          return configuredForModel && m.priceVersions[0]
            ? [
                {
                  id: m.id,
                  providerModelId: m.providerModelId,
                  name: m.displayName,
                  mediaKind: m.mediaKind,
                  description: m.description,
                  priceVersionId: m.priceVersions[0].id,
                  pricingDimension: m.priceVersions[0].pricingDimension,
                  unitQuantity:
                    m.priceVersions[0].unitQuantity?.toString() ?? null,
                  credits:
                    m.priceVersions[0].pricingDimension === "TOKEN"
                      ? "0"
                      : priceCredits(m.priceVersions[0]).toString(),
                  capabilities:
                    m.mediaKind === "VIDEO" &&
                    m.capabilities &&
                    typeof m.capabilities === "object" &&
                    !Array.isArray(m.capabilities)
                      ? {
                          ...m.capabilities,
                          referenceVideo:
                            (m.capabilities as Record<string, unknown>)
                              .referenceVideo === true &&
                            (m.priceVersions[0].pricingDimension === "TOKEN" ||
                              (m.priceVersions[0].videoInputRate720p !== null &&
                                m.priceVersions[0].videoInputRate1080p !==
                                  null)),
                        }
                      : m.capabilities,
                },
              ]
            : [];
        }),
        voices: listPublicPresetVoices(),
        projects,
        jobs: jobs.map((j) => {
          const payload =
            j.requestPayload &&
            typeof j.requestPayload === "object" &&
            !Array.isArray(j.requestPayload)
              ? (j.requestPayload as Record<string, unknown>)
              : {};
          const videoWorkflow =
            j.providerModel.mediaKind === "VIDEO" &&
            payload.schemaVersion === 2 &&
            typeof payload.workflow === "string"
              ? payload.workflow
              : null;
          return {
            id: j.id,
            status: j.status,
            errorMessage: j.errorMessage,
            reservedCredits: j.reservedCredits.toString(),
            chargedCredits: j.chargedCredits.toString(),
            quotedUnits: j.quotedUnits,
            actualUnits: j.actualUnits,
            createdAt: j.createdAt.toISOString(),
            providerModel: j.providerModel,
            project: j.project,
            assets: j.assets,
            videoWorkflow,
            draftExpiresAt:
              videoWorkflow === "DRAFT"
                ? new Date(
                    j.createdAt.getTime() + 7 * 24 * 60 * 60 * 1000,
                  ).toISOString()
                : null,
          };
        }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return generationError(error);
  }
}
