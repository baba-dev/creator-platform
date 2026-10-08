import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { createTranscriptionJob } from "@aiwa/generation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { creativeLocaleIntentSchema } from "@aiwa/generation/locale";

import { generationError } from "@/lib/generation-api";
import { rateLimit } from "@/lib/rate-limit";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import {
  getAvailableStudioModels,
  selectStudioModelBySelection,
  StudioModelUnavailableError,
} from "@/lib/studio-model-discovery";

const limiter = rateLimit({
  max: 10,
  windowMs: 60_000,
  prefix: "transcription",
});

const createSchema = z
  .object({
    organizationId: z.string().min(1).max(100),
    projectId: z.string().min(1).max(100).nullable().optional(),
    modelId: z.string().min(1).max(100),
    priceVersionId: z.string().min(1).max(100),
    quoteToken: z.string().min(1).max(2048).optional(),
    idempotencyKey: z.uuid(),
    sourceAssetId: z.string().min(1).max(100),
    language: z.string().trim().min(2).max(20).optional(),
    localeIntent: creativeLocaleIntentSchema.optional(),
    prompt: z.string().trim().max(1000).optional(),
  })
  .strict();

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });

  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  const rateLimited = await limiter.check(session.user.id);
  if (rateLimited) return rateLimited;

  try {
    const input = createSchema.parse(await request.json());
    const discovery = await getAvailableStudioModels("transcription");
    const selected = selectStudioModelBySelection(discovery, input.modelId);
    if (selected.pricing.priceVersionId !== input.priceVersionId)
      return NextResponse.json(
        { error: "Transcription pricing changed. Refresh the estimate." },
        { status: 409 },
      );

    const job = await createTranscriptionJob(session.user.id, {
      ...input,
      modelId: selected.id,
    });
    return NextResponse.json(
      {
        jobId: job.id,
        status: job.status,
        model: {
          id: selected.id,
          provider: selected.provider,
          providerModelId: selected.providerModelId,
          name: selected.name,
        },
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof StudioModelUnavailableError)
      return NextResponse.json({ error: error.message }, { status: 409 });
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

  const organizationId =
    new URL(request.url).searchParams.get("organizationId") ?? "";
  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId: session.user.id,
      },
    },
    include: { organization: true },
  });
  if (
    !membership ||
    membership.organization.status !== "ACTIVE" ||
    !hasOrganizationPermission(membership.role, "workspace:view")
  )
    return NextResponse.json({ error: "Access denied." }, { status: 403 });

  const ownOnly = membership.role !== "ORGANIZATION_OWNER";
  const [assets, jobs] = await Promise.all([
    db.asset.findMany({
      where: {
        organizationId,
        status: "READY",
        mediaKind: { in: ["AUDIO", "VIDEO"] },
        durationMs: { not: null },
        byteSize: { lte: 25n * 1024n * 1024n },
        OR: [
          { purpose: "GENERAL" },
          {
            purpose: "REFERENCE_INPUT",
            storageOwnerUserId: session.user.id,
          },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      select: {
        id: true,
        name: true,
        originalFilename: true,
        mediaKind: true,
        mimeType: true,
        byteSize: true,
        durationMs: true,
        projectId: true,
        createdAt: true,
      },
    }),
    db.generationJob.findMany({
      where: {
        organizationId,
        ...(ownOnly ? { createdById: session.user.id } : {}),
        requestPayload: {
          path: "$.task",
          equals: "transcription",
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
      select: {
        id: true,
        status: true,
        errorCode: true,
        errorMessage: true,
        requestPayload: true,
        outputPayload: true,
        reservedCredits: true,
        chargedCredits: true,
        createdAt: true,
        completedAt: true,
        providerModel: {
          select: {
            id: true,
            provider: true,
            providerModelId: true,
            displayName: true,
          },
        },
        assets: {
          where: { status: "READY", mediaKind: "DOCUMENT" },
          orderBy: { generationOutputIndex: "asc" },
          select: {
            id: true,
            name: true,
            mimeType: true,
            byteSize: true,
            generationOutputIndex: true,
          },
        },
      },
    }),
  ]);

  return NextResponse.json(
    {
      assets: assets.map((asset) => ({
        ...asset,
        byteSize: asset.byteSize.toString(),
        createdAt: asset.createdAt.toISOString(),
      })),
      jobs: jobs.map((job) => ({
        ...job,
        reservedCredits: job.reservedCredits.toString(),
        chargedCredits: job.chargedCredits.toString(),
        createdAt: job.createdAt.toISOString(),
        completedAt: job.completedAt?.toISOString() ?? null,
        assets: job.assets.map((asset) => ({
          ...asset,
          byteSize: asset.byteSize.toString(),
        })),
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
