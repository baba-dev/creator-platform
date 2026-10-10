import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

import {
  finalizeAssetStorage,
  releaseAssetStorage,
  reserveAssetStorage,
} from "@aiwa/assets";
import { hasOrganizationPermission } from "@aiwa/authz";
import { parseServerEnv } from "@aiwa/config";
import {
  captureCreditsForReference,
  quoteProviderToolPrice,
  mediaToolResolutionRate,
  releaseCreditsForReference,
  reserveCreditsForReference,
} from "@aiwa/credits";
import { db, type Prisma } from "@aiwa/db";
import { muscatCalendarMonth } from "@aiwa/organizations";
import {
  ProviderRequestError,
  type MediaToolProvider,
  type ProviderToolTask,
} from "@aiwa/providers";
import { z } from "zod";

import { issueProviderToolMediaGrant } from "./provider-media-grant";
import {
  downloadImage,
  downloadMediaToolAnalysis,
  storeImage,
  downloadVideo,
  storeVideo,
} from "./storage";
import {
  parseMediaToolInput,
  mediaToolSourceRoles,
  mediaToolImageInputFits,
  mediaToolSourceIssue,
  scrollingDurationCeiling,
} from "./media-tool-input";

const REFERENCE_TYPE = "PROVIDER_TOOL_EXECUTION";
const MAX_ACTIVE_PER_USER = 5;
const MAX_ACTIVE_PER_ORG = 20;
const MAX_TOOL_IMAGE_BYTES = 35n * 1024n * 1024n;
const MAX_TOOL_VIDEO_BYTES = 100n * 1024n * 1024n;
const FIRST_VIDEO_TOOLS = new Set([
  "matte-portrait-video",
  "matte-greenscreen-video",
  "semantic-segment",
  "lip-sync",
  "assess-video-quality",
  "enhance-video-smoothness",
]);

export class ProviderToolExecutionError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "ProviderToolExecutionError";
  }
}

export const providerToolExecutionRequestSchema = z
  .object({
    organizationId: z.string().min(1).max(128),
    toolId: z.string().min(1).max(128),
    priceVersionId: z.string().min(1).max(128),
    idempotencyKey: z.uuid(),
    quotedQuantity: z.number().int().min(1).max(104_857_600),
    input: z.record(z.string(), z.unknown()),
    sourceAssets: z
      .array(
        z
          .object({
            assetId: z.string().min(1).max(128),
            role: z.enum([
              "SOURCE_VIDEO",
              "SOURCE_IMAGE",
              "SOURCE_AUDIO",
              "WATERMARK_IMAGE",
            ]),
            position: z.number().int().min(0).max(9),
          })
          .strict(),
      )
      .max(4)
      .default([]),
  })
  .strict();

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

export function providerToolRequestHash(input: {
  toolId: string;
  priceVersionId: string;
  quotedQuantity: number;
  payload: Readonly<Record<string, unknown>>;
  sourceAssets?: readonly {
    assetId: string;
    role: string;
    position: number;
  }[];
}): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(input)))
    .digest("hex");
}

function executionKey(
  organizationId: string,
  userId: string,
  idempotencyKey: string,
): string {
  return createHash("sha256")
    .update(`${organizationId}:${userId}:${idempotencyKey}`)
    .digest("hex");
}

function priceQuote(
  price: {
    providerCostMicroUsd: bigint;
    providerCostNoOutputMicroUsd?: bigint | null;
    pricingMetric: "REQUEST" | "INPUT_SECOND" | "OUTPUT_SECOND" | "INPUT_BYTE";
    proportional?: boolean;
    resolutionRates?: unknown;
    unitQuantity: number;
    fxBaisaNumerator: bigint;
    fxBaisaDenominator: bigint;
    targetMarginBps: number;
    creditsPerBaisa: bigint;
  },
  quantity: number,
  providerCostMicroUsd = price.providerCostMicroUsd,
  durationMs?: number | null,
) {
  return quoteProviderToolPrice({
    providerCostMicroUsd,
    proportional: price.proportional,
    pricingMetric: price.pricingMetric,
    unitQuantity: price.unitQuantity,
    billableQuantity: price.proportional && durationMs ? durationMs : quantity,
    billableQuantityDenominator: price.proportional && durationMs ? 1000n : 1n,
    exchangeRate: {
      baisaNumerator: price.fxBaisaNumerator,
      baisaDenominator: price.fxBaisaDenominator,
    },
    targetGrossMarginBps: price.targetMarginBps,
    creditsPerBaisa: price.creditsPerBaisa,
  });
}

async function requireToolMembership(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
) {
  const member = await tx.membership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: { organization: true, user: true },
  });
  if (
    !member ||
    member.user.disabledAt ||
    member.user.emailVerified !== true ||
    member.organization.status !== "ACTIVE" ||
    !hasOrganizationPermission(member.role, "generation:create")
  ) {
    throw new ProviderToolExecutionError("Workspace access denied.", 403);
  }
  return member;
}

async function assertToolAdmission(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM User WHERE id = ${userId} FOR UPDATE`;
  const active = [
    "QUEUED",
    "SUBMITTING",
    "PROCESSING",
    "MANUAL_REVIEW",
  ] as const;
  const [userActive, orgActive] = await Promise.all([
    tx.providerToolExecution.count({
      where: { createdById: userId, status: { in: [...active] } },
    }),
    tx.providerToolExecution.count({
      where: { organizationId, status: { in: [...active] } },
    }),
  ]);
  if (userActive >= MAX_ACTIVE_PER_USER) {
    throw new ProviderToolExecutionError(
      "Provider-tool concurrency limit reached.",
      429,
    );
  }
  if (orgActive >= MAX_ACTIVE_PER_ORG) {
    throw new ProviderToolExecutionError(
      "Workspace provider-tool concurrency limit reached.",
      429,
    );
  }
}

async function assertToolSpendingCap(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string;
    userId: string;
    cap: bigint | null;
    additionalCredits: bigint;
    now: Date;
  },
): Promise<void> {
  if (params.cap === null) return;
  const { start, end } = muscatCalendarMonth(params.now);
  const [generationDone, generationActive, toolDone, toolActive] =
    await Promise.all([
      tx.generationJob.aggregate({
        where: {
          organizationId: params.organizationId,
          createdById: params.userId,
          createdAt: { gte: start, lt: end },
          status: "SUCCEEDED",
        },
        _sum: { chargedCredits: true },
      }),
      tx.generationJob.aggregate({
        where: {
          organizationId: params.organizationId,
          createdById: params.userId,
          createdAt: { gte: start, lt: end },
          status: { notIn: ["CANCELLED", "FAILED", "DRAFT", "SUCCEEDED"] },
        },
        _sum: { reservedCredits: true },
      }),
      tx.providerToolExecution.aggregate({
        where: {
          organizationId: params.organizationId,
          createdById: params.userId,
          createdAt: { gte: start, lt: end },
          status: "SUCCEEDED",
        },
        _sum: { chargedCredits: true },
      }),
      tx.providerToolExecution.aggregate({
        where: {
          organizationId: params.organizationId,
          createdById: params.userId,
          createdAt: { gte: start, lt: end },
          status: {
            in: ["QUEUED", "SUBMITTING", "PROCESSING", "MANUAL_REVIEW"],
          },
        },
        _sum: { reservedCredits: true },
      }),
    ]);
  const committed =
    (generationDone._sum.chargedCredits ?? 0n) +
    (generationActive._sum.reservedCredits ?? 0n) +
    (toolDone._sum.chargedCredits ?? 0n) +
    (toolActive._sum.reservedCredits ?? 0n);
  if (committed + params.additionalCredits > params.cap) {
    throw new ProviderToolExecutionError("Monthly spending cap exceeded.", 409);
  }
}

function outputReservationForTool(
  providerToolId: string,
  input: Readonly<Record<string, unknown>>,
): {
  extension: "mp4" | "webm" | "png" | "jpg";
  mimeType: "video/mp4" | "video/webm" | "image/png" | "image/jpeg";
  name: string;
} | null {
  if (
    providerToolId === "matte-portrait-video" ||
    providerToolId === "matte-greenscreen-video"
  ) {
    const format = input.format === "MP4" ? "MP4" : "WEBM";
    return format === "MP4"
      ? {
          extension: "mp4",
          mimeType: "video/mp4",
          name: "Matted spokesperson video",
        }
      : {
          extension: "webm",
          mimeType: "video/webm",
          name: "Transparent spokesperson video",
        };
  }
  if (
    providerToolId.endsWith("image") ||
    providerToolId === "add-image-watermark"
  ) {
    const jpeg =
      providerToolId === "compress-image" || providerToolId === "slim-image";
    return {
      extension: jpeg ? "jpg" : "png",
      mimeType: jpeg ? "image/jpeg" : "image/png",
      name: "MediaKit image",
    };
  }
  if (
    [
      "enhance-video-smoothness",
      "lip-sync",
      "text-to-scrolling-video",
    ].includes(providerToolId)
  ) {
    return {
      extension: "mp4",
      mimeType: "video/mp4",
      name:
        providerToolId === "lip-sync"
          ? "Lip-synced video"
          : providerToolId === "text-to-scrolling-video"
            ? "Scrolling text video"
            : "Smoothed spokesperson video",
    };
  }
  return null;
}

function firstVideoTool(providerToolId: string): boolean {
  return FIRST_VIDEO_TOOLS.has(providerToolId);
}

function toolResultRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function classifyProviderVideoOutput(
  result: Record<string, unknown>,
): { kind: "absent" } | { kind: "valid"; url: string } | { kind: "invalid" } {
  const value = result.video_url;
  if (value === undefined || value === null) return { kind: "absent" };
  if (typeof value === "string" && value.length > 0)
    return { kind: "valid", url: value };
  return { kind: "invalid" };
}

function validQualityScore(result: Record<string, unknown>): boolean {
  const score = result.vq_score;
  return (
    typeof score === "number" &&
    Number.isFinite(score) &&
    score >= 0 &&
    score <= 100
  );
}

async function materializeProviderInput(execution: {
  id: string;
  providerTool: { providerToolId: string };
  requestPayload: unknown;
  inputAssets: Array<{
    role: string;
    position: number;
    asset: {
      id: string;
      organizationId: string;
      status: string;
      mediaKind: string;
      purpose: string;
      storageOwnerUserId: string | null;
    };
  }>;
  organizationId: string;
  createdById: string;
}): Promise<Record<string, unknown>> {
  const semantic = toolResultRecord(execution.requestPayload);
  const roles = mediaToolSourceRoles(
    execution.providerTool.providerToolId,
    semantic,
  );
  const env = parseServerEnv();
  const base = new URL(env.APP_URL);
  if (base.protocol !== "https:")
    throw new ProviderRequestError("MediaKit requires public HTTPS", false, {
      code: "INVALID_PROVIDER_SOURCE",
      stage: "dispatch",
    });
  if (execution.inputAssets.length !== roles.length)
    throw new ProviderRequestError("Source snapshot is invalid", false, {
      code: "REFERENCE_MEDIA_UNAVAILABLE",
      stage: "dispatch",
    });
  const urls: Record<string, string> = {};
  for (const [position, role] of roles.entries()) {
    const input = execution.inputAssets.find(
      (item) => item.position === position && item.role === role,
    );
    const asset = input?.asset;
    if (
      !asset ||
      asset.organizationId !== execution.organizationId ||
      asset.status !== "READY" ||
      asset.mediaKind !==
        (role === "WATERMARK_IMAGE" ? "IMAGE" : role.replace("SOURCE_", "")) ||
      (asset.purpose === "REFERENCE_INPUT" &&
        asset.storageOwnerUserId !== execution.createdById)
    ) {
      throw new ProviderRequestError("Source media is unavailable", false, {
        code: "REFERENCE_MEDIA_UNAVAILABLE",
        stage: "dispatch",
      });
    }
    const url = new URL(
      `/api/provider-tool-media/${encodeURIComponent(asset.id)}`,
      base,
    );
    url.searchParams.set("executionId", execution.id);
    url.searchParams.set(
      "grant",
      issueProviderToolMediaGrant({
        secret: env.AUTH_SECRET,
        executionId: execution.id,
        assetId: asset.id,
      }),
    );
    urls[`${role.replace("SOURCE_", "").toLowerCase()}_url`] = url.toString();
  }
  if (execution.providerTool.providerToolId === "enhance-video-smoothness") {
    const alignSourceFps = semantic.alignSourceFps !== false;
    return {
      video_url: urls.video_url,
      periodic_stutter_detect: {
        periodic_stutter_repair: true,
        align_source_fps: alignSourceFps,
      },
      duplicate_frame_detect: { duplicate_frame_repair: true },
    };
  }

  return {
    ...semantic,
    ...urls,
  };
}

export async function createProviderToolExecution(
  userId: string,
  raw: unknown,
) {
  const input = providerToolExecutionRequestSchema.parse(raw);
  const key = executionKey(input.organizationId, userId, input.idempotencyKey);
  const requestHash = providerToolRequestHash({
    toolId: input.toolId,
    priceVersionId: input.priceVersionId,
    quotedQuantity: input.quotedQuantity,
    payload: input.input,
    sourceAssets: input.sourceAssets,
  });

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM Organization WHERE id = ${input.organizationId} FOR UPDATE`;
    const member = await requireToolMembership(
      tx,
      input.organizationId,
      userId,
    );
    const existing = await tx.providerToolExecution.findUnique({
      where: { idempotencyKey: key },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ProviderToolExecutionError(
          "Request key was already used for different tool inputs.",
          409,
        );
      }
      return existing;
    }

    await assertToolAdmission(tx, input.organizationId, userId);
    const now = new Date();
    const tool = await tx.providerTool.findFirst({
      where: { id: input.toolId, provider: "BYTEPLUS", enabled: true },
      include: {
        priceVersions: {
          where: {
            id: input.priceVersionId,
            effectiveFrom: { lte: now },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
          },
          take: 1,
        },
      },
    });
    const price = tool?.priceVersions[0];
    if (!tool || !price || price.pricingMetric !== tool.pricingMetric) {
      throw new ProviderToolExecutionError(
        "Tool or price changed. Refresh and try again.",
        409,
      );
    }
    const semanticInput = parseMediaToolInput(tool.providerToolId, input.input);
    const expectedRoles = mediaToolSourceRoles(
      tool.providerToolId,
      semanticInput,
    );
    if (
      input.sourceAssets.length !== expectedRoles.length ||
      new Set(input.sourceAssets.map((ref) => ref.assetId)).size !==
        expectedRoles.length ||
      input.sourceAssets.some(
        (ref, position) =>
          ref.role !== expectedRoles[position] || ref.position !== position,
      )
    )
      throw new ProviderToolExecutionError("Select the required source media.");
    let sourceAsset: {
      id: string;
      organizationId: string;
      projectId: string | null;
      status: string;
      purpose: string;
      storageOwnerUserId: string | null;
      mediaKind: string;
      mimeType: string;
      durationMs: number | null;
      byteSize: bigint;
      width: number | null;
      height: number | null;
      generationJob: {
        status: string;
        requestPayload: unknown;
        providerModel: { providerModelId: string };
      } | null;
    } | null = null;
    if (firstVideoTool(tool.providerToolId)) {
      if (
        input.sourceAssets.length !==
          mediaToolSourceRoles(tool.providerToolId).length ||
        input.sourceAssets[0]?.role !== "SOURCE_VIDEO" ||
        input.sourceAssets[0]?.position !== 0
      ) {
        throw new ProviderToolExecutionError(
          "This MediaKit tool requires exactly one source video.",
          400,
        );
      }
      sourceAsset = await tx.asset.findFirst({
        where: {
          id: input.sourceAssets[0].assetId,
          organizationId: input.organizationId,
        },
        select: {
          id: true,
          organizationId: true,
          projectId: true,
          status: true,
          purpose: true,
          storageOwnerUserId: true,
          mediaKind: true,
          mimeType: true,
          durationMs: true,
          byteSize: true,
          width: true,
          height: true,
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
        !sourceAsset ||
        sourceAsset.status !== "READY" ||
        sourceAsset.mediaKind !== "VIDEO" ||
        (sourceAsset.purpose === "REFERENCE_INPUT" &&
          sourceAsset.storageOwnerUserId !== userId)
      ) {
        throw new ProviderToolExecutionError(
          "Source video is unavailable.",
          409,
        );
      }
      if (!["video/mp4", "video/quicktime"].includes(sourceAsset.mimeType)) {
        throw new ProviderToolExecutionError(
          "This MediaKit tool does not support the source video format.",
          400,
        );
      }
      if (
        sourceAsset.byteSize > MAX_TOOL_VIDEO_BYTES ||
        (tool.providerToolId === "lip-sync" &&
          sourceAsset.mimeType !== "video/mp4")
      )
        throw new ProviderToolExecutionError(
          "Source video exceeds 100 MiB or is not MP4 for lip sync.",
        );
      const generationPayload = toolResultRecord(
        sourceAsset.generationJob?.requestPayload,
      );
      const legacyOmniHumanDuration =
        sourceAsset.generationJob?.status === "SUCCEEDED" &&
        sourceAsset.generationJob.providerModel.providerModelId ===
          "omnihuman-1.5" &&
        typeof generationPayload.trustedDrivingAudioDurationMs === "number" &&
        Number.isSafeInteger(generationPayload.trustedDrivingAudioDurationMs) &&
        generationPayload.trustedDrivingAudioDurationMs > 0
          ? generationPayload.trustedDrivingAudioDurationMs
          : null;
      const trustedDurationMs =
        sourceAsset.durationMs ?? legacyOmniHumanDuration;
      if (
        trustedDurationMs === null ||
        !Number.isSafeInteger(trustedDurationMs) ||
        trustedDurationMs <= 0
      ) {
        throw new ProviderToolExecutionError(
          "Source video is missing trusted duration metadata.",
          409,
        );
      }
      const sourceIssue = mediaToolSourceIssue(
        tool.providerToolId,
        "SOURCE_VIDEO",
        { ...sourceAsset, durationMs: trustedDurationMs },
      );
      if (sourceIssue) throw new ProviderToolExecutionError(sourceIssue);
      if (
        tool.providerToolId === "semantic-segment" &&
        trustedDurationMs > 10_800_000
      )
        throw new ProviderToolExecutionError(
          "Segmentation supports videos up to three hours.",
        );
      if (tool.providerToolId === "lip-sync" && trustedDurationMs > 1_800_000)
        throw new ProviderToolExecutionError(
          "Lip sync supports videos up to 30 minutes.",
        );
      const trustedQuantity = Math.ceil(trustedDurationMs / 1000);
      if (
        tool.providerToolId !== "lip-sync" &&
        trustedQuantity !== input.quotedQuantity
      ) {
        throw new ProviderToolExecutionError(
          "MediaKit quote is stale. Refresh the video and try again.",
          409,
        );
      }
      if (
        tool.providerToolId === "enhance-video-smoothness" &&
        trustedDurationMs > 35_000
      ) {
        throw new ProviderToolExecutionError(
          "Smoothness repair supports source videos up to 35 seconds.",
          400,
        );
      }
    } else {
      const ref = input.sourceAssets[0];
      if (
        input.sourceAssets.length !== expectedRoles.length ||
        ref?.role !== "SOURCE_IMAGE" ||
        ref.position !== 0
      )
        throw new ProviderToolExecutionError("Select one source image.");
      sourceAsset = await tx.asset.findFirst({
        where: { id: ref.assetId, organizationId: input.organizationId },
        include: { generationJob: { include: { providerModel: true } } },
      });
      if (
        !sourceAsset ||
        sourceAsset.status !== "READY" ||
        sourceAsset.mediaKind !== "IMAGE" ||
        !["image/png", "image/jpeg", "image/webp"].includes(
          sourceAsset.mimeType,
        ) ||
        sourceAsset.byteSize <= 0n ||
        sourceAsset.byteSize > 35n * 1024n * 1024n ||
        (sourceAsset.purpose === "REFERENCE_INPUT" &&
          sourceAsset.storageOwnerUserId !== userId)
      )
        throw new ProviderToolExecutionError(
          "Source image is unavailable or exceeds 35 MiB.",
        );
      const quantity =
        tool.pricingMetric === "INPUT_BYTE"
          ? Number(sourceAsset.byteSize)
          : tool.providerToolId === "text-to-scrolling-video"
            ? scrollingDurationCeiling(
                parseMediaToolInput(tool.providerToolId, input.input),
              )
            : 1;
      if (quantity > 86400 && tool.pricingMetric !== "INPUT_BYTE")
        throw new ProviderToolExecutionError(
          "Shorten the scrolling text or reduce page duration.",
        );
      if (input.quotedQuantity !== quantity)
        throw new ProviderToolExecutionError(
          "MediaKit quote is stale. Refresh and try again.",
          409,
        );
    }
    if (
      sourceAsset &&
      !mediaToolImageInputFits(
        semanticInput,
        sourceAsset.width,
        sourceAsset.height,
      )
    )
      throw new ProviderToolExecutionError(
        "Crop exceeds the source dimensions or trusted dimensions are missing.",
      );
    if (sourceAsset?.mediaKind === "IMAGE") {
      const issue = mediaToolSourceIssue(
        tool.providerToolId,
        "SOURCE_IMAGE",
        sourceAsset,
      );
      if (issue) throw new ProviderToolExecutionError(issue);
    }
    const extraSources = [];
    for (const ref of input.sourceAssets.slice(1)) {
      if (ref.role === "WATERMARK_IMAGE") {
        const logo = await tx.asset.findFirst({
          where: { id: ref.assetId, organizationId: input.organizationId },
        });
        if (
          !logo ||
          logo.status !== "READY" ||
          logo.mediaKind !== "IMAGE" ||
          !["image/png", "image/jpeg", "image/webp"].includes(logo.mimeType) ||
          logo.byteSize <= 0n ||
          logo.byteSize > 5n * 1024n * 1024n ||
          (logo.purpose === "REFERENCE_INPUT" &&
            logo.storageOwnerUserId !== userId)
        )
          throw new ProviderToolExecutionError(
            "Logo is unavailable or exceeds 5 MiB.",
          );
        const issue = mediaToolSourceIssue(
          tool.providerToolId,
          "WATERMARK_IMAGE",
          logo,
        );
        if (issue) throw new ProviderToolExecutionError(issue);
        extraSources.push({
          executionId: "",
          assetId: logo.id,
          position: ref.position,
          role: ref.role,
        });
        continue;
      }
      if (ref.role !== "SOURCE_AUDIO" || ref.position !== 1)
        throw new ProviderToolExecutionError("Invalid source role.");
      const audio = await tx.asset.findFirst({
        where: { id: ref.assetId, organizationId: input.organizationId },
      });
      if (
        !audio ||
        audio.status !== "READY" ||
        audio.mediaKind !== "AUDIO" ||
        !["audio/mpeg", "audio/wav", "audio/x-wav"].includes(audio.mimeType) ||
        (audio.purpose === "REFERENCE_INPUT" &&
          audio.storageOwnerUserId !== userId) ||
        !audio.durationMs ||
        audio.byteSize > MAX_TOOL_VIDEO_BYTES
      )
        throw new ProviderToolExecutionError("Source audio is unavailable.");
      const issue = mediaToolSourceIssue(
        tool.providerToolId,
        "SOURCE_AUDIO",
        audio,
      );
      if (issue) throw new ProviderToolExecutionError(issue);
      // Lip-sync output follows driving audio duration.
      if (input.quotedQuantity !== Math.ceil(audio.durationMs / 1000))
        throw new ProviderToolExecutionError("Audio quote is stale.", 409);
      extraSources.push({
        executionId: "",
        assetId: audio.id,
        position: ref.position,
        role: ref.role,
      });
    }

    if (sourceAsset) {
      const unsettledForSource = await tx.providerToolExecution.findFirst({
        where: {
          organizationId: input.organizationId,
          createdById: userId,
          status: {
            in: ["QUEUED", "SUBMITTING", "PROCESSING", "MANUAL_REVIEW"],
          },
          inputAssets: { some: { assetId: sourceAsset.id } },
          providerTool: {
            providerToolId: { in: [...FIRST_VIDEO_TOOLS] },
          },
        },
        select: { id: true },
      });
      if (unsettledForSource) {
        throw new ProviderToolExecutionError(
          "This video already has unsettled MediaKit work. Wait for it to finish or request operator review.",
          409,
        );
      }
    }

    const quote = priceQuote(price, input.quotedQuantity);
    await assertToolSpendingCap(tx, {
      organizationId: input.organizationId,
      userId,
      cap: member.monthlySpendingCapCredits,
      additionalCredits: quote.customerCredits,
      now,
    });
    const wallet = await tx.wallet.findUnique({
      where: { organizationId: input.organizationId },
    });
    if (!wallet)
      throw new ProviderToolExecutionError(
        "Workspace wallet is unavailable.",
        409,
      );

    const execution = await tx.providerToolExecution.create({
      data: {
        organizationId: input.organizationId,
        createdById: userId,
        providerToolId: tool.id,
        priceVersionId: price.id,
        idempotencyKey: key,
        requestHash,
        requestPayload: semanticInput as Prisma.InputJsonValue,
        quotedQuantity: input.quotedQuantity,
        reservedCredits: quote.customerCredits,
        status: "QUEUED",
      },
    });
    if (sourceAsset) {
      await tx.providerToolInputAsset.create({
        data: {
          executionId: execution.id,
          assetId: sourceAsset.id,
          position: 0,
          role: input.sourceAssets[0]!.role,
        },
      });
      for (const ref of extraSources)
        await tx.providerToolInputAsset.create({
          data: { ...ref, executionId: execution.id },
        });
      const output = outputReservationForTool(tool.providerToolId, input.input);
      if (output) {
        await reserveAssetStorage(tx, {
          organizationId: input.organizationId,
          userId,
          proposedBytes: output.mimeType.startsWith("image/")
            ? MAX_TOOL_IMAGE_BYTES
            : MAX_TOOL_VIDEO_BYTES,
        });
        await tx.asset.create({
          data: {
            organizationId: input.organizationId,
            projectId: sourceAsset.projectId,
            providerToolExecutionId: execution.id,
            providerToolOutputIndex: 0,
            sourceAssetId: sourceAsset.id,
            storageOwnerUserId: userId,
            createdById: userId,
            status: "PENDING",
            purpose: "GENERAL",
            mediaKind: output.mimeType.startsWith("image/") ? "IMAGE" : "VIDEO",
            sourceType: "DERIVED",
            storageProvider: "LOCAL",
            name: output.name,
            objectKey: `${execution.id}-tool.${output.extension}`,
            mimeType: output.mimeType,
            byteSize: output.mimeType.startsWith("image/")
              ? MAX_TOOL_IMAGE_BYTES
              : MAX_TOOL_VIDEO_BYTES,
          },
        });
      }
    }
    await reserveCreditsForReference(tx, {
      walletId: wallet.id,
      amountCredits: quote.customerCredits,
      idempotencyKey: `provider-tool-reserve-${execution.id}`,
      referenceType: REFERENCE_TYPE,
      referenceId: execution.id,
      description: `Reservation for provider tool execution ${execution.id}`,
      metadata: { providerToolId: tool.id, priceVersionId: price.id },
    });
    await tx.auditEvent.create({
      data: {
        actorUserId: userId,
        organizationId: input.organizationId,
        action: "provider_tool.execution_queued",
        targetType: "ProviderToolExecution",
        targetId: execution.id,
        requestId: input.idempotencyKey,
        metadata: {
          providerToolId: tool.id,
          providerToolKey: tool.providerToolId,
          quotedQuantity: input.quotedQuantity,
          reservedCredits: quote.customerCredits.toString(),
        },
      },
    });
    return execution;
  });
}

function retryAt(retryCount: number): Date {
  const delayMs = Math.min(300_000, 5_000 * 2 ** Math.min(retryCount, 6));
  return new Date(Date.now() + delayMs);
}

async function markRetryable(
  executionId: string,
  expected: "SUBMITTING" | "PROCESSING",
  error: ProviderRequestError,
): Promise<void> {
  const current = await db.providerToolExecution.findUnique({
    where: { id: executionId },
    select: { retryCount: true, maxAttempts: true },
  });
  if (!current) return;
  const next = current.retryCount + 1;
  await db.providerToolExecution.updateMany({
    where: { id: executionId, status: expected },
    data:
      next >= current.maxAttempts
        ? {
            status: "MANUAL_REVIEW",
            retryCount: next,
            nextAttemptAt: null,
            errorCode: error.code ?? "PROVIDER_RETRY_EXHAUSTED",
            errorMessage:
              "Provider recovery attempts were exhausted. Credits remain reserved for operator review.",
          }
        : {
            status: expected === "SUBMITTING" ? "QUEUED" : "PROCESSING",
            retryCount: next,
            nextAttemptAt: retryAt(next),
            errorCode: error.code ?? "PROVIDER_TEMPORARY_ERROR",
            errorMessage:
              "Provider operation is temporarily unavailable; durable recovery will retry.",
          },
  });
}

async function releaseTerminal(
  executionId: string,
  status: "FAILED" | "CANCELLED",
  code: string,
  message: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM ProviderToolExecution WHERE id = ${executionId} FOR UPDATE`;
    const execution = await tx.providerToolExecution.findUnique({
      where: { id: executionId },
    });
    if (
      !execution ||
      ["FAILED", "CANCELLED", "SUCCEEDED"].includes(execution.status)
    )
      return;
    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { organizationId: execution.organizationId },
    });
    await releaseCreditsForReference(tx, {
      walletId: wallet.id,
      amountCredits: execution.reservedCredits,
      idempotencyKey: `provider-tool-release-${execution.id}`,
      referenceType: REFERENCE_TYPE,
      referenceId: execution.id,
      description: message,
      metadata: { errorCode: code },
    });
    const pendingOutputs = await tx.asset.findMany({
      where: { providerToolExecutionId: execution.id, status: "PENDING" },
      select: { id: true, byteSize: true },
    });
    const reservedOutputBytes = pendingOutputs.reduce(
      (total, asset) => total + asset.byteSize,
      0n,
    );
    if (reservedOutputBytes > 0n) {
      await releaseAssetStorage(tx, {
        organizationId: execution.organizationId,
        reservedBytes: reservedOutputBytes,
      });
      await tx.asset.updateMany({
        where: { id: { in: pendingOutputs.map((asset) => asset.id) } },
        data: {
          status: "DELETED",
          byteSize: 0n,
          deletedAt: new Date(),
          purgeAfter: new Date(),
        },
      });
    }
    await tx.providerToolExecution.update({
      where: { id: execution.id },
      data: {
        status,
        reservedCredits: 0n,
        errorCode: code,
        errorMessage: message,
        nextAttemptAt: null,
        completedAt: new Date(),
      },
    });
    await tx.auditEvent.create({
      data: {
        actorUserId: execution.createdById,
        organizationId: execution.organizationId,
        action:
          status === "FAILED"
            ? "provider_tool.failed"
            : "provider_tool.cancelled",
        targetType: "ProviderToolExecution",
        targetId: execution.id,
        metadata: { errorCode: code },
      },
    });
  });
}

export function providerToolActualQuantity(
  pricingMetric: "REQUEST" | "INPUT_SECOND" | "OUTPUT_SECOND" | "INPUT_BYTE",
  result: Readonly<Record<string, unknown>> | undefined,
): number | null {
  if (pricingMetric === "REQUEST") return 1;
  const raw = result?.duration;
  const duration =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && /^\d+(?:\.\d+)?$/.test(raw)
        ? Number(raw)
        : Number.NaN;
  if (!Number.isFinite(duration) || duration <= 0 || duration > 86_400)
    return null;
  return Math.ceil(duration);
}

function providerToolDurationMs(
  result: Readonly<Record<string, unknown>>,
): number | null {
  const raw = result.duration;
  const duration =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && /^\d+(?:\.\d+)?$/.test(raw)
        ? Number(raw)
        : Number.NaN;
  if (!Number.isFinite(duration) || duration <= 0 || duration > 86_400)
    return null;
  return Math.round(duration * 1000);
}

async function deferOutputRecovery(
  executionId: string,
  errorCode: string,
): Promise<void> {
  const current = await db.providerToolExecution.findUnique({
    where: { id: executionId },
    select: { retryCount: true, maxAttempts: true },
  });
  if (!current) return;
  const next = current.retryCount + 1;
  await db.providerToolExecution.updateMany({
    where: { id: executionId, status: "PROCESSING" },
    data:
      next >= current.maxAttempts
        ? {
            status: "MANUAL_REVIEW",
            retryCount: next,
            nextAttemptAt: null,
            errorCode,
            errorMessage:
              "MediaKit completed, but output storage recovery was exhausted. Credits remain reserved for review.",
          }
        : {
            retryCount: next,
            nextAttemptAt: retryAt(next),
            errorCode,
            errorMessage:
              "MediaKit completed, but the output is still being saved. Credits remain reserved until durable storage succeeds.",
          },
  });
}

async function persistProviderSuccess(
  executionId: string,
  result: ProviderToolTask,
): Promise<void> {
  await db.providerToolExecution.updateMany({
    where: {
      id: executionId,
      status: { in: ["SUBMITTING", "PROCESSING"] },
    },
    data: {
      status: "PROCESSING",
      providerTaskId: result.providerTaskId,
      providerRequestId: result.providerRequestId,
      resultPayload: (result.result ?? {}) as Prisma.InputJsonValue,
      retryCount: 0,
      nextAttemptAt: new Date(),
      errorCode: null,
      errorMessage: null,
    },
  });
}

async function finalizeSucceededExecution(executionId: string): Promise<void> {
  const execution = await db.providerToolExecution.findUnique({
    where: { id: executionId },
    include: {
      providerTool: true,
      priceVersion: true,
      outputAssets: { orderBy: { providerToolOutputIndex: "asc" } },
    },
  });
  if (
    !execution ||
    execution.status !== "PROCESSING" ||
    !execution.resultPayload
  )
    return;

  const result = toolResultRecord(execution.resultPayload);
  const actualQuantity =
    execution.priceVersion.pricingMetric === "INPUT_BYTE"
      ? execution.quotedQuantity
      : providerToolActualQuantity(
          execution.priceVersion.pricingMetric,
          result,
        );
  if (actualQuantity === null) {
    await db.providerToolExecution.updateMany({
      where: { id: execution.id, status: "PROCESSING" },
      data: {
        status: "MANUAL_REVIEW",
        nextAttemptAt: null,
        errorCode: "MISSING_PROVIDER_USAGE",
        errorMessage:
          "Provider succeeded without authoritative billable usage. Credits remain reserved for operator review.",
      },
    });
    return;
  }

  const toolKey = execution.providerTool.providerToolId;
  if (toolKey === "semantic-segment") {
    try {
      let rawSegments: unknown = result.segments;
      if (!Array.isArray(rawSegments)) {
        if (typeof result.result_url !== "string")
          throw new Error("Missing segmentation output");
        const bytes = await downloadMediaToolAnalysis(result.result_url);
        const data = JSON.parse(
          gunzipSync(bytes, { maxOutputLength: 2 * 1024 * 1024 }).toString(
            "utf8",
          ),
        );
        rawSegments = data.segments;
      }
      const segments = z
        .array(
          z
            .object({
              index: z.number().int().min(0),
              start_ms: z.number().int().min(0),
              end_ms: z.number().int().positive(),
            })
            .strip()
            .refine((v) => v.end_ms > v.start_ms && v.end_ms <= 10_800_000),
        )
        .min(1)
        .max(10800)
        .parse(rawSegments);
      result.segments = segments;
      await db.providerToolExecution.updateMany({
        where: { id: execution.id, status: "PROCESSING" },
        data: { resultPayload: result as Prisma.InputJsonValue },
      });
    } catch {
      await deferOutputRecovery(execution.id, "TOOL_ANALYSIS_STORAGE_FAILED");
      return;
    }
  }
  if (toolKey === "assess-video-quality" && !validQualityScore(result)) {
    await db.providerToolExecution.updateMany({
      where: { id: execution.id, status: "PROCESSING" },
      data: {
        status: "MANUAL_REVIEW",
        nextAttemptAt: null,
        errorCode: "INVALID_PROVIDER_RESPONSE",
        errorMessage:
          "MediaKit quality assessment returned an invalid VQScore. Credits remain reserved for review.",
      },
    });
    return;
  }

  const imageOutput = execution.providerTool.category === "image";
  const output = classifyProviderVideoOutput(
    imageOutput ? { video_url: result.image_url } : result,
  );
  if (output.kind === "invalid") {
    await db.providerToolExecution.updateMany({
      where: { id: execution.id, status: "PROCESSING" },
      data: {
        status: "MANUAL_REVIEW",
        nextAttemptAt: null,
        errorCode: "INVALID_PROVIDER_RESPONSE",
        errorMessage:
          "MediaKit returned a malformed video output. Credits remain reserved for review.",
      },
    });
    return;
  }
  const outputUrl = output.kind === "valid" ? output.url : null;
  const outputAsset = execution.outputAssets[0] ?? null;
  const detectionOnly =
    toolKey === "enhance-video-smoothness" && outputUrl === null;

  if (
    outputReservationForTool(
      toolKey,
      toolResultRecord(execution.requestPayload),
    ) &&
    !detectionOnly &&
    !outputUrl
  ) {
    await db.providerToolExecution.updateMany({
      where: { id: execution.id, status: "PROCESSING" },
      data: {
        status: "MANUAL_REVIEW",
        nextAttemptAt: null,
        errorCode: "INVALID_PROVIDER_RESPONSE",
        errorMessage:
          "MediaKit matting completed without a video output. Credits remain reserved for review.",
      },
    });
    return;
  }

  let stored: Awaited<ReturnType<typeof storeVideo>> | null = null;

  if (outputUrl && outputAsset?.status === "PENDING") {
    try {
      const expectedFormat =
        outputAsset.mimeType === "video/webm" ? "webm" : "mp4";
      if (imageOutput) {
        const bytes = await downloadImage(
          outputUrl,
          outputAsset.mimeType === "image/jpeg" ? "jpeg" : "png",
        );
        stored = await storeImage(
          outputAsset.objectKey,
          bytes,
          execution.organizationId,
          outputAsset.id,
        );
      } else {
        const bytes = await downloadVideo(outputUrl, expectedFormat);
        stored = await storeVideo(
          outputAsset.objectKey,
          bytes,
          execution.organizationId,
          outputAsset.id,
          outputAsset.mimeType === "video/webm" ? "video/webm" : "video/mp4",
        );
      }
    } catch {
      await deferOutputRecovery(execution.id, "TOOL_OUTPUT_STORAGE_FAILED");
      return;
    }
  } else if (outputUrl && outputAsset?.status !== "READY") {
    await db.providerToolExecution.updateMany({
      where: { id: execution.id, status: "PROCESSING" },
      data: {
        status: "MANUAL_REVIEW",
        nextAttemptAt: null,
        errorCode: "OUTPUT_ASSET_STATE_INVALID",
        errorMessage:
          "MediaKit output reservation is not recoverable. Credits remain reserved for review.",
      },
    });
    return;
  }

  const resolutionRate = mediaToolResolutionRate(
    execution.priceVersion.resolutionRates,
    result.resolution,
  );
  if (execution.priceVersion.resolutionRates && resolutionRate === null) {
    await db.providerToolExecution.updateMany({
      where: { id: execution.id, status: "PROCESSING" },
      data: {
        status: "MANUAL_REVIEW",
        nextAttemptAt: null,
        errorCode: "MISSING_PROVIDER_RESOLUTION",
        errorMessage:
          "Provider resolution is missing from the price tariff. Credits remain reserved for review.",
      },
    });
    return;
  }
  const effectiveProviderCost = detectionOnly
    ? execution.priceVersion.providerCostNoOutputMicroUsd
    : (resolutionRate ?? execution.priceVersion.providerCostMicroUsd);
  if (effectiveProviderCost === null) {
    await db.providerToolExecution.updateMany({
      where: { id: execution.id, status: "PROCESSING" },
      data: {
        status: "MANUAL_REVIEW",
        nextAttemptAt: null,
        errorCode: "MISSING_NO_OUTPUT_PRICE",
        errorMessage:
          "Smoothness detection completed without repair, but no detection-only price is configured. Credits remain reserved.",
      },
    });
    return;
  }

  const quote = priceQuote(
    execution.priceVersion,
    actualQuantity,
    effectiveProviderCost,
    execution.priceVersion.pricingMetric.endsWith("SECOND")
      ? providerToolDurationMs(result)
      : null,
  );
  if (quote.customerCredits > execution.reservedCredits) {
    await db.providerToolExecution.updateMany({
      where: { id: execution.id, status: "PROCESSING" },
      data: {
        status: "MANUAL_REVIEW",
        actualQuantity,
        actualProviderCostMicroUsd: quote.providerCostMicroUsd,
        nextAttemptAt: null,
        errorCode: "ACTUAL_COST_EXCEEDS_RESERVATION",
        errorMessage:
          "Provider usage exceeded the pre-authorized reservation. No extra credits were captured automatically.",
      },
    });
    return;
  }

  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM ProviderToolExecution WHERE id = ${execution.id} FOR UPDATE`;
    const current = await tx.providerToolExecution.findUniqueOrThrow({
      where: { id: execution.id },
      include: {
        outputAssets: { orderBy: { providerToolOutputIndex: "asc" } },
      },
    });
    if (current.status !== "PROCESSING") return;

    const currentOutput = current.outputAssets[0] ?? null;
    let readyOutputAssetId: string | null =
      currentOutput?.status === "READY" ? currentOutput.id : null;

    if (stored && currentOutput?.status === "PENDING") {
      await finalizeAssetStorage(tx, {
        organizationId: current.organizationId,
        reservedBytes: currentOutput.byteSize,
        actualBytes: stored.byteSize,
      });
      const ready = await tx.asset.update({
        where: { id: currentOutput.id },
        data: {
          ...stored,
          status: "READY",
          durationMs: providerToolDurationMs(result),
        },
      });
      readyOutputAssetId = ready.id;
    } else if (detectionOnly && currentOutput?.status === "PENDING") {
      await releaseAssetStorage(tx, {
        organizationId: current.organizationId,
        reservedBytes: currentOutput.byteSize,
      });
      await tx.asset.update({
        where: { id: currentOutput.id },
        data: {
          status: "DELETED",
          byteSize: 0n,
          deletedAt: new Date(),
          purgeAfter: new Date(),
        },
      });
    }

    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { organizationId: current.organizationId },
    });
    await captureCreditsForReference(tx, {
      walletId: wallet.id,
      amountCredits: quote.customerCredits,
      idempotencyKey: `provider-tool-capture-${current.id}`,
      referenceType: REFERENCE_TYPE,
      referenceId: current.id,
      description: `Capture for provider tool execution ${current.id}`,
      metadata: {
        pricingMetric: execution.priceVersion.pricingMetric,
        actualQuantity,
        billableUnits: quote.billableUnits.toString(),
        detectionOnly,
        ...(readyOutputAssetId ? { outputAssetId: readyOutputAssetId } : {}),
      },
    });
    await tx.providerToolExecution.update({
      where: { id: current.id },
      data: {
        status: "SUCCEEDED",
        actualQuantity,
        chargedCredits: quote.customerCredits,
        reservedCredits: quote.customerCredits,
        actualProviderCostMicroUsd: quote.providerCostMicroUsd,
        retryCount: 0,
        nextAttemptAt: null,
        errorCode: null,
        errorMessage: null,
        completedAt: new Date(),
      },
    });
    await tx.auditEvent.create({
      data: {
        actorUserId: current.createdById,
        organizationId: current.organizationId,
        action: "provider_tool.succeeded",
        targetType: "ProviderToolExecution",
        targetId: current.id,
        metadata: {
          providerToolId: current.providerToolId,
          pricingMetric: execution.priceVersion.pricingMetric,
          actualQuantity,
          chargedCredits: quote.customerCredits.toString(),
          detectionOnly,
          ...(readyOutputAssetId ? { outputAssetId: readyOutputAssetId } : {}),
        },
      },
    });
  });
}

export async function processProviderToolExecution(
  executionId: string,
  provider: MediaToolProvider,
): Promise<void> {
  let execution = await db.providerToolExecution.findUnique({
    where: { id: executionId },
    include: {
      providerTool: true,
      priceVersion: true,
      inputAssets: {
        orderBy: { position: "asc" },
        include: { asset: true },
      },
      outputAssets: { orderBy: { providerToolOutputIndex: "asc" } },
    },
  });
  if (!execution) return;

  if (execution.status === "QUEUED") {
    if (!execution.providerTool.enabled) {
      if (execution.retryCount === 0) {
        await releaseTerminal(
          execution.id,
          "FAILED",
          "TOOL_DISABLED",
          "Tool was disabled before provider submission. Credits released.",
        );
      } else {
        await db.providerToolExecution.updateMany({
          where: { id: execution.id, status: "QUEUED" },
          data: {
            status: "MANUAL_REVIEW",
            nextAttemptAt: null,
            errorCode: "TOOL_DISABLED_DURING_RECOVERY",
            errorMessage:
              "Tool was disabled during provider recovery. Credits remain reserved for review.",
          },
        });
      }
      return;
    }
    const claimed = await db.providerToolExecution.updateMany({
      where: { id: execution.id, status: "QUEUED" },
      data: {
        status: "SUBMITTING",
        submittedAt: execution.submittedAt ?? new Date(),
      },
    });
    if (!claimed.count) return;
    execution = await db.providerToolExecution.findUniqueOrThrow({
      where: { id: execution.id },
      include: {
        providerTool: true,
        priceVersion: true,
        inputAssets: {
          orderBy: { position: "asc" },
          include: { asset: true },
        },
        outputAssets: { orderBy: { providerToolOutputIndex: "asc" } },
      },
    });
  }

  if (execution.status === "SUBMITTING") {
    let submitted: ProviderToolTask;
    try {
      const providerInput = await materializeProviderInput(execution);
      submitted = await provider.submit({
        idempotencyKey: execution.idempotencyKey,
        toolId: execution.providerTool.providerToolId,
        input: providerInput,
      });
    } catch (error) {
      if (error instanceof ProviderRequestError && error.retryable) {
        await markRetryable(execution.id, "SUBMITTING", error);
        return;
      }
      if (error instanceof ProviderRequestError) {
        await releaseTerminal(
          execution.id,
          "FAILED",
          error.code ?? "PROVIDER_REJECTED",
          "Provider rejected the tool request. Credits released.",
        );
        return;
      }
      await db.providerToolExecution.updateMany({
        where: { id: execution.id, status: "SUBMITTING" },
        data: {
          status: "MANUAL_REVIEW",
          nextAttemptAt: null,
          errorCode: "UNEXPECTED_SUBMISSION_ERROR",
          errorMessage:
            "Submission outcome could not be classified. Credits remain reserved for review.",
        },
      });
      return;
    }

    if (submitted.status === "failed" || submitted.status === "cancelled") {
      await releaseTerminal(
        execution.id,
        submitted.status === "cancelled" ? "CANCELLED" : "FAILED",
        submitted.errorCode ?? "PROVIDER_REJECTED",
        "Provider did not complete the tool request. Credits released.",
      );
      return;
    }
    if (submitted.status === "succeeded") {
      await persistProviderSuccess(execution.id, submitted);
      await finalizeSucceededExecution(execution.id);
      return;
    }
    if (!submitted.providerTaskId) {
      await db.providerToolExecution.updateMany({
        where: { id: execution.id, status: "SUBMITTING" },
        data: {
          status: "MANUAL_REVIEW",
          nextAttemptAt: null,
          errorCode: "MISSING_PROVIDER_TASK_ID",
          errorMessage:
            "Provider accepted work without a recoverable task identifier. Credits remain reserved for review.",
        },
      });
      return;
    }
    await db.providerToolExecution.updateMany({
      where: { id: execution.id, status: "SUBMITTING" },
      data: {
        status: "PROCESSING",
        providerTaskId: submitted.providerTaskId,
        providerRequestId: submitted.providerRequestId,
        retryCount: 0,
        nextAttemptAt: retryAt(0),
        errorCode: null,
        errorMessage: null,
      },
    });
    return;
  }

  if (execution.status !== "PROCESSING") return;
  if (execution.resultPayload) {
    await finalizeSucceededExecution(execution.id);
    return;
  }
  if (!execution.providerTaskId) return;

  let polled: ProviderToolTask;
  try {
    polled = await provider.getTask(execution.providerTaskId);
  } catch (error) {
    if (error instanceof ProviderRequestError && error.retryable) {
      await markRetryable(execution.id, "PROCESSING", error);
      return;
    }
    await db.providerToolExecution.updateMany({
      where: { id: execution.id, status: "PROCESSING" },
      data: {
        status: "MANUAL_REVIEW",
        nextAttemptAt: null,
        errorCode:
          error instanceof ProviderRequestError
            ? (error.code ?? "PROVIDER_POLL_FAILED")
            : "UNEXPECTED_POLL_ERROR",
        errorMessage:
          "Provider task status is no longer safely recoverable. Credits remain reserved for operator review.",
      },
    });
    return;
  }

  if (polled.status === "submitted" || polled.status === "processing") {
    await db.providerToolExecution.updateMany({
      where: { id: execution.id, status: "PROCESSING" },
      data: {
        retryCount: 0,
        nextAttemptAt: retryAt(0),
        errorCode: null,
        errorMessage: null,
      },
    });
    return;
  }
  if (polled.status === "failed" || polled.status === "cancelled") {
    await releaseTerminal(
      execution.id,
      polled.status === "cancelled" ? "CANCELLED" : "FAILED",
      polled.errorCode ??
        (polled.status === "cancelled"
          ? "PROVIDER_CANCELLED"
          : "PROVIDER_FAILED"),
      "Provider did not complete the tool request. Credits released.",
    );
    return;
  }
  await persistProviderSuccess(execution.id, polled);
  await finalizeSucceededExecution(execution.id);
}

// Recover an accepted request before consulting today's price or source metadata.
// Its original reservation and exact semantic snapshot remain authoritative.
export async function recoverMediaToolRequest(
  userId: string,
  params: {
    organizationId: string;
    toolKey: string;
    assetIds: string[];
    input: unknown;
    idempotencyKey: string;
    priceVersionId?: string;
    reservedCredits?: string;
  },
) {
  await requireToolMembership(db, params.organizationId, userId);
  const existing = await db.providerToolExecution.findUnique({
    where: {
      idempotencyKey: executionKey(
        params.organizationId,
        userId,
        params.idempotencyKey,
      ),
    },
    include: { providerTool: { select: { providerToolId: true } } },
  });
  if (!existing) return null;
  const semantic = parseMediaToolInput(params.toolKey, params.input);
  const roles = mediaToolSourceRoles(params.toolKey, semantic);
  const hash = providerToolRequestHash({
    toolId: existing.providerToolId,
    priceVersionId: existing.priceVersionId,
    quotedQuantity: existing.quotedQuantity,
    payload: semantic,
    sourceAssets: params.assetIds.map((assetId, position) => ({
      assetId,
      position,
      role: roles[position] ?? "INVALID",
    })),
  });
  if (
    existing.organizationId !== params.organizationId ||
    existing.createdById !== userId ||
    existing.providerTool.providerToolId !== params.toolKey ||
    params.priceVersionId !== existing.priceVersionId ||
    params.reservedCredits !== existing.reservedCredits.toString() ||
    hash !== existing.requestHash
  )
    throw new ProviderToolExecutionError(
      "Request key was already used for different tool inputs.",
      409,
    );
  return existing;
}

export async function prepareMediaToolRequest(
  userId: string,
  params: {
    organizationId: string;
    toolKey: string;
    assetIds: string[];
    input: unknown;
  },
) {
  await requireToolMembership(db, params.organizationId, userId);
  const now = new Date();
  const tool = await db.providerTool.findFirst({
    where: {
      provider: "BYTEPLUS",
      providerToolId: params.toolKey,
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
  const price = tool?.priceVersions[0];
  if (!tool || !price || tool.pricingMetric !== price.pricingMetric)
    throw new ProviderToolExecutionError("Tool pricing is unavailable.", 409);
  const semantic = parseMediaToolInput(params.toolKey, params.input);
  const roles = mediaToolSourceRoles(params.toolKey, semantic);
  if (
    params.assetIds.length !== roles.length ||
    new Set(params.assetIds).size !== roles.length
  )
    throw new ProviderToolExecutionError("Select the required source media.");
  const assets = [];
  for (const [position, role] of roles.entries()) {
    const asset = await db.asset.findFirst({
      where: {
        id: params.assetIds[position],
        organizationId: params.organizationId,
        status: "READY",
      },
    });
    if (
      !asset ||
      asset.mediaKind !==
        (role === "WATERMARK_IMAGE" ? "IMAGE" : role.replace("SOURCE_", "")) ||
      (asset.purpose === "REFERENCE_INPUT" &&
        asset.storageOwnerUserId !== userId)
    )
      throw new ProviderToolExecutionError("Source media is unavailable.", 404);
    if (
      role === "WATERMARK_IMAGE" &&
      (!["image/png", "image/jpeg", "image/webp"].includes(asset.mimeType) ||
        asset.byteSize <= 0n ||
        asset.byteSize > 5n * 1024n * 1024n)
    )
      throw new ProviderToolExecutionError(
        "Logo must be PNG, JPEG or WebP and at most 5 MiB.",
      );
    const issue = mediaToolSourceIssue(params.toolKey, role, asset);
    if (issue) throw new ProviderToolExecutionError(issue);
    assets.push(asset);
  }
  if (!mediaToolImageInputFits(semantic, assets[0]!.width, assets[0]!.height))
    throw new ProviderToolExecutionError(
      "Crop exceeds the source dimensions or trusted dimensions are missing.",
    );
  const durationAsset = params.toolKey === "lip-sync" ? assets[1]! : assets[0]!;
  const quantity =
    tool.pricingMetric === "REQUEST"
      ? 1
      : tool.pricingMetric === "INPUT_BYTE"
        ? Number(assets[0]!.byteSize)
        : params.toolKey === "text-to-scrolling-video"
          ? scrollingDurationCeiling(semantic)
          : durationAsset.durationMs
            ? Math.ceil(durationAsset.durationMs / 1000)
            : 0;
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    (tool.pricingMetric !== "INPUT_BYTE" && quantity > 86400)
  )
    throw new ProviderToolExecutionError(
      "Source needs trusted duration metadata, or scrolling text is too long.",
      409,
    );
  const costQuote = priceQuote(price, quantity);
  return {
    organizationId: params.organizationId,
    toolId: tool.id,
    priceVersionId: price.id,
    quotedQuantity: quantity,
    input: semantic,
    sourceAssets: assets.map((asset, position) => ({
      assetId: asset.id,
      role: roles[position]!,
      position,
    })),
    reservedCredits: costQuote.customerCredits.toString(),
    customerPriceBaisa: costQuote.customerPriceBaisa.toString(),
    creditsPerBaisa: price.creditsPerBaisa.toString(),
    fxBaisaNumerator: price.fxBaisaNumerator.toString(),
    fxBaisaDenominator: price.fxBaisaDenominator.toString(),
    pricingMetric: tool.pricingMetric,
    unitQuantity: price.unitQuantity.toString(),
  };
}
