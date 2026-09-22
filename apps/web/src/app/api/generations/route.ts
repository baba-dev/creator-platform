import { db } from "@aiwa/db";
import {
  createImageJob,
  createVideoJob,
  createVoiceJob,
  GenerationError,
  imageModelIds,
  listPublicPresetVoices,
  priceCredits,
  requireMembership,
  videoModelIds,
  voiceModelIds,
} from "@aiwa/generation";
import { LedgerDomainError } from "@aiwa/credits";
import {
  isBytePlusMediaConfigured,
  isBytePlusVoiceConfigured,
} from "@aiwa/providers/byteplus";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

function failure(error: unknown) {
  const status =
    error instanceof GenerationError
      ? error.status
      : error instanceof ZodError ||
          error instanceof SyntaxError ||
          error instanceof LedgerDomainError
        ? 400
        : 503;
  const message =
    error instanceof GenerationError || error instanceof LedgerDomainError
      ? error.message
      : status === 400
        ? "Invalid generation request."
        : "Generation service unavailable. Retry with the same request.";
  return NextResponse.json({ error: message }, { status });
}
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
    const text = await request.text();
    if (text.length > 12000)
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
      select: { mediaKind: true },
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
    } else {
      if (!isBytePlusMediaConfigured()) {
        return NextResponse.json(
          { error: "Media generation is not configured." },
          { status: 503 },
        );
      }
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
    return failure(error);
  }
}
export async function GET(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const organizationId =
    new URL(request.url).searchParams.get("organizationId") ?? "";
  try {
    await requireMembership(db, organizationId, session.user.id);
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
    const jobs = await db.generationJob.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        status: true,
        errorMessage: true,
        reservedCredits: true,
        chargedCredits: true,
        createdAt: true,
        providerModel: { select: { displayName: true, mediaKind: true } },
        assets: {
          where: { status: "READY" },
          select: { id: true, mimeType: true },
        },
      },
    });
    const wallet = await db.wallet.findUnique({
      where: { organizationId },
      select: { balanceCache: true },
    });
    const mediaConfigured = isBytePlusMediaConfigured();
    const voiceConfigured = isBytePlusVoiceConfigured();
    return NextResponse.json(
      {
        configured: mediaConfigured || voiceConfigured,
        mediaConfigured,
        voiceConfigured,
        balance: wallet?.balanceCache.toString() ?? "0",
        models: models.flatMap((m) =>
          m.priceVersions[0]
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
                  credits: priceCredits(m.priceVersions[0]).toString(),
                  capabilities: m.capabilities,
                },
              ]
            : [],
        ),
        voices: listPublicPresetVoices(),
        jobs: jobs.map((j) => ({
          ...j,
          reservedCredits: j.reservedCredits.toString(),
          chargedCredits: j.chargedCredits.toString(),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
