import { quoteProviderToolPrice } from "@aiwa/credits";
import { db } from "@aiwa/db";
import {
  createProviderToolExecution,
  ProviderToolExecutionError,
  requireMembership,
} from "@aiwa/generation";
import { isBytePlusMediaKitConfigured } from "@aiwa/providers/byteplus";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const toolKeySchema = z.enum(["matting", "quality", "smoothness"]);
type ToolKey = z.infer<typeof toolKeySchema>;

const providerToolIds: Record<ToolKey, string> = {
  matting: "matte-portrait-video",
  quality: "assess-video-quality",
  smoothness: "enhance-video-smoothness",
};

const postSchema = z
  .object({
    organizationId: z.string().min(1).max(128),
    assetId: z.string().min(1).max(128),
    tool: toolKeySchema,
    idempotencyKey: z.uuid(),
    mattingFormat: z.enum(["WEBM", "MP4"]).default("WEBM"),
    backgroundColor: z.enum(["black", "white", "green"]).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.tool === "matting" &&
      value.mattingFormat !== "MP4" &&
      value.backgroundColor !== undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["backgroundColor"],
        message: "Background color is available only for MP4 matting output.",
      });
    }
  });

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function loadOmniHumanVideo(
  organizationId: string,
  assetId: string,
  userId: string,
) {
  let currentId: string | null = assetId;
  let source: {
    id: string;
    durationMs: number | null;
    mimeType: string;
    sourceAssetId: string | null;
  } | null = null;
  let trustedOriginDurationMs: number | null = null;
  const visited = new Set<string>();

  for (let depth = 0; currentId && depth < 8; depth += 1) {
    if (visited.has(currentId)) return null;
    visited.add(currentId);
    const asset = await db.asset.findFirst({
      where: { id: currentId, organizationId },
      select: {
        id: true,
        organizationId: true,
        status: true,
        purpose: true,
        storageOwnerUserId: true,
        mediaKind: true,
        mimeType: true,
        durationMs: true,
        sourceAssetId: true,
        generationJob: {
          select: {
            status: true,
            requestPayload: true,
            providerModel: { select: { providerModelId: true } },
          },
        },
      },
    });
    if (
      !asset ||
      asset.status !== "READY" ||
      asset.mediaKind !== "VIDEO" ||
      (asset.purpose === "REFERENCE_INPUT" &&
        asset.storageOwnerUserId !== userId)
    )
      return null;

    if (depth === 0) {
      source = {
        id: asset.id,
        durationMs: asset.durationMs,
        mimeType: asset.mimeType,
        sourceAssetId: asset.sourceAssetId,
      };
    }

    if (
      asset.generationJob?.status === "SUCCEEDED" &&
      asset.generationJob.providerModel.providerModelId === "omnihuman-1.5"
    ) {
      const payload = record(asset.generationJob.requestPayload);
      trustedOriginDurationMs =
        typeof payload.trustedDrivingAudioDurationMs === "number" &&
        Number.isSafeInteger(payload.trustedDrivingAudioDurationMs) &&
        payload.trustedDrivingAudioDurationMs > 0
          ? payload.trustedDrivingAudioDurationMs
          : null;
      if (!source) return null;
      const durationMs = source.durationMs ?? trustedOriginDurationMs;
      if (!durationMs || durationMs <= 0) return null;
      return { ...source, durationMs };
    }
    currentId = asset.sourceAssetId;
  }
  return null;
}

function quote(
  price: {
    providerCostMicroUsd: bigint;
    pricingMetric: "REQUEST" | "INPUT_SECOND" | "OUTPUT_SECOND";
    unitQuantity: number;
    fxBaisaNumerator: bigint;
    fxBaisaDenominator: bigint;
    targetMarginBps: number;
    creditsPerBaisa: bigint;
  },
  quantity: number,
  providerCostMicroUsd = price.providerCostMicroUsd,
) {
  return quoteProviderToolPrice({
    providerCostMicroUsd,
    pricingMetric: price.pricingMetric,
    unitQuantity: price.unitQuantity,
    billableQuantity: quantity,
    exchangeRate: {
      baisaNumerator: price.fxBaisaNumerator,
      baisaDenominator: price.fxBaisaDenominator,
    },
    targetGrossMarginBps: price.targetMarginBps,
    creditsPerBaisa: price.creditsPerBaisa,
  });
}

async function loadTool(providerToolId: string) {
  const now = new Date();
  return db.providerTool.findFirst({
    where: { provider: "BYTEPLUS", providerToolId },
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

export async function GET(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId") ?? "";
  const assetId = url.searchParams.get("assetId") ?? "";
  if (!organizationId || !assetId)
    return NextResponse.json(
      { error: "organizationId and assetId are required." },
      { status: 400 },
    );

  try {
    await requireMembership(db, organizationId, session.user.id, true);
    const source = await loadOmniHumanVideo(
      organizationId,
      assetId,
      session.user.id,
    );
    if (!source)
      return NextResponse.json(
        { error: "Choose a completed OmniHuman video." },
        { status: 404 },
      );

    const quantity = Math.ceil(source.durationMs / 1000);
    const rows = await Promise.all(
      (Object.entries(providerToolIds) as Array<[ToolKey, string]>).map(
        async ([key, providerToolId]) => {
          const tool = await loadTool(providerToolId);
          const price = tool?.priceVersions[0];
          const repairAllowed =
            key !== "smoothness" || source.durationMs <= 35_000;
          if (!tool || !price || price.pricingMetric !== tool.pricingMetric) {
            return {
              key,
              providerToolId,
              available: false,
              enabled: tool?.enabled ?? false,
              repairAllowed,
              reason: "Pricing is not configured.",
            };
          }
          const maximum = quote(price, quantity);
          const detectionOnly =
            key === "smoothness" && price.providerCostNoOutputMicroUsd
              ? quote(price, quantity, price.providerCostNoOutputMicroUsd)
              : null;
          return {
            key,
            providerToolId,
            available:
              tool.enabled &&
              isBytePlusMediaKitConfigured() &&
              repairAllowed &&
              (key !== "smoothness" || detectionOnly !== null),
            enabled: tool.enabled,
            repairAllowed,
            priceVersionId: price.id,
            estimatedCredits: maximum.customerCredits.toString(),
            detectionOnlyCredits:
              detectionOnly?.customerCredits.toString() ?? null,
            reason: !isBytePlusMediaKitConfigured()
              ? "MediaKit credential is not configured."
              : !tool.enabled
                ? "Tool is disabled by an administrator."
                : !repairAllowed
                  ? "Smoothness repair supports videos up to 35 seconds."
                  : key === "smoothness" && !detectionOnly
                    ? "Detection-only pricing is not configured."
                    : null,
          };
        },
      ),
    );

    return NextResponse.json({
      asset: {
        id: source.id,
        durationMs: source.durationMs,
        mimeType: source.mimeType,
      },
      tools: rows,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load MediaKit tools.",
      },
      { status: 403 },
    );
  }
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
  if (!isBytePlusMediaKitConfigured())
    return NextResponse.json(
      { error: "MediaKit is not configured on the worker." },
      { status: 503 },
    );

  try {
    const input = postSchema.parse(await request.json());
    await requireMembership(db, input.organizationId, session.user.id, true);
    const source = await loadOmniHumanVideo(
      input.organizationId,
      input.assetId,
      session.user.id,
    );
    if (!source)
      return NextResponse.json(
        { error: "Choose a completed OmniHuman video." },
        { status: 404 },
      );
    if (input.tool === "smoothness" && source.durationMs > 35_000)
      return NextResponse.json(
        { error: "Smoothness repair supports videos up to 35 seconds." },
        { status: 400 },
      );

    const providerToolId = providerToolIds[input.tool];
    const tool = await loadTool(providerToolId);
    const price = tool?.priceVersions[0];
    if (
      !tool ||
      !tool.enabled ||
      !price ||
      price.pricingMetric !== tool.pricingMetric ||
      (input.tool === "smoothness" && !price.providerCostNoOutputMicroUsd)
    )
      return NextResponse.json(
        { error: "This MediaKit tool is not currently available." },
        { status: 409 },
      );

    const semanticInput: Record<string, unknown> =
      input.tool === "matting"
        ? {
            format: input.mattingFormat,
            ...(input.mattingFormat === "MP4" && input.backgroundColor
              ? { background_color: input.backgroundColor }
              : {}),
          }
        : input.tool === "smoothness"
          ? { alignSourceFps: true }
          : {};

    const execution = await createProviderToolExecution(session.user.id, {
      organizationId: input.organizationId,
      toolId: tool.id,
      priceVersionId: price.id,
      idempotencyKey: input.idempotencyKey,
      quotedQuantity: Math.ceil(source.durationMs / 1000),
      input: semanticInput,
      sourceAssets: [{ assetId: source.id, role: "SOURCE_VIDEO", position: 0 }],
    });

    return NextResponse.json(
      {
        execution: {
          id: execution.id,
          status: execution.status,
          reservedCredits: execution.reservedCredits.toString(),
        },
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof ProviderToolExecutionError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: "Invalid MediaKit request." },
        { status: 400 },
      );
    return NextResponse.json(
      { error: "Unable to start MediaKit processing." },
      { status: 500 },
    );
  }
}
