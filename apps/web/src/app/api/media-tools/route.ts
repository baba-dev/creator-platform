import { AssetQuotaExceededError } from "@aiwa/assets";
import { LedgerDomainError } from "@aiwa/credits";
import { db } from "@aiwa/db";
import { formatBaisa } from "../../../lib/format-baisa";
import { publicCostBreakdown } from "../../../lib/customer-cost-breakdown";
import { requireMembership } from "@aiwa/generation";
import {
  createProviderToolExecution,
  prepareMediaToolRequest,
  recoverMediaToolRequest,
  ProviderToolExecutionError,
} from "@aiwa/generation/media-tools";
import { isBytePlusMediaKitConfigured } from "@aiwa/providers/byteplus";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import { rateLimit } from "@/lib/rate-limit";

import {
  mediaToolAssetSelect,
  serializeMediaToolAsset,
} from "../../../lib/media-tool-assets";

const limiter = rateLimit({
  max: 20,
  windowMs: 60_000,
  prefix: "mediakit-workspace",
});
const schema = z
  .object({
    organizationId: z.string().min(1).max(128),
    toolKey: z.string().min(1).max(128),
    assetIds: z.array(z.string().min(1).max(128)).min(1).max(2),
    input: z.record(z.string(), z.unknown()),
    action: z.enum(["quote", "execute"]),
    priceVersionId: z.string().max(128).optional(),
    reservedCredits: z.string().regex(/^\d+$/).optional(),
    idempotencyKey: z.uuid().optional(),
  })
  .strict();

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
    await requireMembership(db, organizationId, session.user.id, false);
    const now = new Date();
    const [tools, assets, executions] = await Promise.all([
      db.providerTool.findMany({
        where: { provider: "BYTEPLUS" },
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
        orderBy: [{ category: "asc" }, { displayName: "asc" }],
      }),
      db.asset.findMany({
        where: {
          organizationId,
          status: "READY",
          mediaKind: { in: ["IMAGE", "VIDEO", "AUDIO"] },
          OR: [
            { purpose: { not: "REFERENCE_INPUT" } },
            { storageOwnerUserId: session.user.id },
          ],
        },
        select: mediaToolAssetSelect,
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      db.providerToolExecution.findMany({
        where: { organizationId, createdById: session.user.id },
        select: {
          id: true,
          status: true,
          providerTool: { select: { displayName: true, providerToolId: true } },
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);
    return NextResponse.json(
      {
        tools: tools.map((tool) => ({
          key: tool.providerToolId,
          name: tool.displayName,
          description: tool.description,
          category: tool.category,
          available:
            isBytePlusMediaKitConfigured() &&
            tool.enabled &&
            tool.priceVersions[0]?.pricingMetric === tool.pricingMetric,
        })),
        assets: assets.map(serializeMediaToolAsset),
        executions,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Workspace access denied." },
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
      { error: "MediaKit is not configured." },
      { status: 503 },
    );
  const limited = await limiter.check(session.user.id);
  if (limited) return limited;
  const text = await request.text();
  if (Buffer.byteLength(text) > 16 * 1024)
    return NextResponse.json(
      { error: "Request is too large." },
      { status: 413 },
    );
  try {
    const input = schema.parse(JSON.parse(text));
    if (input.action === "execute" && input.idempotencyKey) {
      const existing = await recoverMediaToolRequest(session.user.id, {
        ...input,
        idempotencyKey: input.idempotencyKey,
      });
      if (existing)
        return NextResponse.json(
          { execution: { id: existing.id, status: existing.status } },
          { status: 202 },
        );
    }
    const prepared = await prepareMediaToolRequest(session.user.id, input);
    if (input.action === "quote")
      return NextResponse.json({
        quote: {
          priceVersionId: prepared.priceVersionId,
          reservedCredits: prepared.reservedCredits,
          quotedQuantity: prepared.quotedQuantity,
          estimatedCredits: prepared.reservedCredits,
          reservationCredits: prepared.reservedCredits,
          estimatedOmr: formatBaisa(BigInt(prepared.customerPriceBaisa)),
          maximumChargeOmr: formatBaisa(BigInt(prepared.customerPriceBaisa)),
          creditsPerBaisa: prepared.creditsPerBaisa,
          pricingDimension: prepared.pricingMetric,
          unitQuantity: prepared.unitQuantity,
          settlement: "ACTUAL_USAGE",
          pricingBreakdown: publicCostBreakdown(
            BigInt(prepared.customerPriceBaisa),
            BigInt(prepared.customerPriceBaisa),
            {
              baisaNumerator: BigInt(prepared.fxBaisaNumerator),
              baisaDenominator: BigInt(prepared.fxBaisaDenominator),
            },
          ),
        },
      });
    if (
      !input.idempotencyKey ||
      input.priceVersionId !== prepared.priceVersionId ||
      input.reservedCredits !== prepared.reservedCredits
    )
      return NextResponse.json(
        { error: "Quote changed. Review a fresh quote." },
        { status: 409 },
      );
    const execution = await createProviderToolExecution(session.user.id, {
      organizationId: prepared.organizationId,
      toolId: prepared.toolId,
      priceVersionId: prepared.priceVersionId,
      quotedQuantity: prepared.quotedQuantity,
      input: prepared.input,
      sourceAssets: prepared.sourceAssets,
      idempotencyKey: input.idempotencyKey,
    });
    return NextResponse.json(
      { execution: { id: execution.id, status: execution.status } },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof ProviderToolExecutionError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (
      error instanceof AssetQuotaExceededError ||
      error instanceof LedgerDomainError
    )
      return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return NextResponse.json(
        { error: "Check tool inputs." },
        { status: 400 },
      );
    throw error;
  }
}
