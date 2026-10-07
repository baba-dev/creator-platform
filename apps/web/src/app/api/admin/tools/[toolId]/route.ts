import { createHash } from "node:crypto";

import { hasPlatformPermission } from "@aiwa/authz";
import { DEFAULT_FX_RATE, quoteProviderToolPrice } from "@aiwa/credits";
import { db, type ProviderToolPriceVersion } from "@aiwa/db";
import {
  providerToolRecordIdSchema,
  publishProviderToolPriceVersionSchema,
  toggleProviderToolEnabledSchema,
} from "@aiwa/validation";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

function serializePrice(price: ProviderToolPriceVersion) {
  return {
    id: price.id,
    providerCostMicroUsd: price.providerCostMicroUsd.toString(),
    providerCostNoOutputMicroUsd:
      price.providerCostNoOutputMicroUsd?.toString() ?? null,
    customerCredits: price.customerCredits.toString(),
    pricingMetric: price.pricingMetric,
    unitQuantity: price.unitQuantity,
    targetMarginBps: price.targetMarginBps,
    creditsPerBaisa: price.creditsPerBaisa.toString(),
    fxBaisaNumerator: price.fxBaisaNumerator.toString(),
    fxBaisaDenominator: price.fxBaisaDenominator.toString(),
    providerCostBasisNote: price.providerCostBasisNote,
    effectiveFrom: price.effectiveFrom.toISOString(),
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ toolId: string }> },
): Promise<NextResponse> {
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
  if (!hasPlatformPermission(session.user.platformRole, "models:manage")) {
    return NextResponse.json(
      { error: "You do not have permission to manage provider tools." },
      { status: 403 },
    );
  }

  const { toolId } = await params;
  if (!providerToolRecordIdSchema.safeParse(toolId).success) {
    return NextResponse.json({ error: "Tool not found." }, { status: 404 });
  }
  const tool = await db.providerTool.findUnique({ where: { id: toolId } });
  if (!tool) {
    return NextResponse.json({ error: "Tool not found." }, { status: 404 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Invalid request payload." },
      { status: 400 },
    );
  }

  const toggle = toggleProviderToolEnabledSchema.safeParse(body);
  if (toggle.success) {
    if (toggle.data.enabled) {
      const now = new Date();
      const activePrice = await db.providerToolPriceVersion.findFirst({
        where: {
          providerToolId: tool.id,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        orderBy: { effectiveFrom: "desc" },
      });
      if (
        !activePrice ||
        activePrice.providerCostMicroUsd <= 0n ||
        activePrice.pricingMetric !== tool.pricingMetric
      ) {
        return NextResponse.json(
          {
            error: "Publish a valid matching price before enabling this tool.",
          },
          { status: 409 },
        );
      }
    }
    const updated = await db.$transaction(async (tx) => {
      const row = await tx.providerTool.update({
        where: { id: tool.id },
        data: { enabled: toggle.data.enabled },
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: session.user.id,
          action: "provider_tool.availability_toggled",
          targetType: "ProviderTool",
          targetId: tool.id,
          metadata: {
            enabled: toggle.data.enabled,
            providerToolId: tool.providerToolId,
          },
        },
      });
      return row;
    });
    revalidatePath("/admin/tools");
    return NextResponse.json({
      ok: true,
      tool: { id: updated.id, enabled: updated.enabled },
    });
  }

  const publication = publishProviderToolPriceVersionSchema.safeParse(body);
  if (!publication.success) {
    return NextResponse.json(
      { error: "Invalid provider-tool pricing payload." },
      { status: 400 },
    );
  }

  const input = publication.data;
  if ((input.creditsPerBaisa ?? 1n) !== 1n) {
    return NextResponse.json(
      {
        error:
          "The platform credit denomination is fixed at 1 credit per baisa.",
      },
      { status: 400 },
    );
  }
  if (
    input.providerCostNoOutputMicroUsd !== undefined &&
    input.providerCostNoOutputMicroUsd > input.providerCostMicroUsd
  ) {
    return NextResponse.json(
      { error: "Detection-only provider cost cannot exceed the maximum provider cost." },
      { status: 400 },
    );
  }
  if (tool.pricingMetric === "REQUEST" && input.unitQuantity !== 1) {
    return NextResponse.json(
      { error: "Request-priced tools must use a unit quantity of 1." },
      { status: 400 },
    );
  }

  const fxBaisaNumerator =
    input.fxBaisaNumerator ?? DEFAULT_FX_RATE.baisaNumerator;
  const fxBaisaDenominator =
    input.fxBaisaDenominator ?? DEFAULT_FX_RATE.baisaDenominator;
  const customerQuote = quoteProviderToolPrice({
    providerCostMicroUsd: input.providerCostMicroUsd,
    pricingMetric: tool.pricingMetric,
    unitQuantity: input.unitQuantity,
    billableQuantity: tool.pricingMetric === "REQUEST" ? 1 : input.unitQuantity,
    exchangeRate: {
      baisaNumerator: fxBaisaNumerator,
      baisaDenominator: fxBaisaDenominator,
    },
    targetGrossMarginBps: input.targetMarginBps,
    creditsPerBaisa: 1n,
  });

  const publicationHash = createHash("sha256")
    .update(
      JSON.stringify(
        {
          providerToolId: tool.id,
          providerCostMicroUsd: input.providerCostMicroUsd,
          providerCostNoOutputMicroUsd:
            input.providerCostNoOutputMicroUsd ?? null,
          pricingMetric: tool.pricingMetric,
          unitQuantity: input.unitQuantity,
          targetMarginBps: input.targetMarginBps,
          fxBaisaNumerator,
          fxBaisaDenominator,
          creditsPerBaisa: 1n,
          providerCostBasisNote: input.providerCostBasisNote ?? null,
        },
        (_key, value: unknown) =>
          typeof value === "bigint" ? value.toString() : value,
      ),
    )
    .digest("hex");

  const existing = await db.providerToolPriceVersion.findUnique({
    where: { publicationKey: input.idempotencyKey },
  });
  if (existing) {
    if (
      existing.providerToolId !== tool.id ||
      existing.publicationHash !== publicationHash
    ) {
      return NextResponse.json(
        {
          error:
            "Pricing idempotency key was already used with different parameters.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({
      ok: true,
      priceVersion: serializePrice(existing),
    });
  }

  const now = new Date();
  const created = await db
    .$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM ProviderTool WHERE id = ${tool.id} FOR UPDATE`;
      const replay = await tx.providerToolPriceVersion.findUnique({
        where: { publicationKey: input.idempotencyKey },
      });
      if (replay) {
        if (
          replay.providerToolId !== tool.id ||
          replay.publicationHash !== publicationHash
        ) {
          throw new Error("PRICING_IDEMPOTENCY_CONFLICT");
        }
        return replay;
      }
      await tx.providerToolPriceVersion.updateMany({
        where: {
          providerToolId: tool.id,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        data: { effectiveTo: now },
      });
      const price = await tx.providerToolPriceVersion.create({
        data: {
          providerToolId: tool.id,
          publicationKey: input.idempotencyKey,
          publicationHash,
          providerCostMicroUsd: input.providerCostMicroUsd,
          providerCostNoOutputMicroUsd:
            input.providerCostNoOutputMicroUsd ?? null,
          customerCredits: customerQuote.customerCredits,
          fxBaisaNumerator,
          fxBaisaDenominator,
          targetMarginBps: input.targetMarginBps,
          pricingMetric: tool.pricingMetric,
          unitQuantity: input.unitQuantity,
          creditsPerBaisa: 1n,
          providerCostBasisNote: input.providerCostBasisNote,
          effectiveFrom: now,
          createdById: session.user.id,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: session.user.id,
          action: "provider_tool.price_published",
          targetType: "ProviderTool",
          targetId: tool.id,
          requestId: input.idempotencyKey,
          metadata: {
            providerToolId: tool.providerToolId,
            pricingMetric: tool.pricingMetric,
            unitQuantity: input.unitQuantity,
            providerCostMicroUsd: input.providerCostMicroUsd.toString(),
            providerCostNoOutputMicroUsd:
              input.providerCostNoOutputMicroUsd?.toString() ?? null,
            customerCredits: customerQuote.customerCredits.toString(),
            targetMarginBps: input.targetMarginBps,
          },
        },
      });
      return price;
    })
    .catch((error: unknown) => {
      if (
        error instanceof Error &&
        error.message === "PRICING_IDEMPOTENCY_CONFLICT"
      ) {
        return null;
      }
      throw error;
    });
  if (!created) {
    return NextResponse.json(
      { error: "Pricing idempotency key conflict." },
      { status: 409 },
    );
  }
  revalidatePath("/admin/tools");
  return NextResponse.json({ ok: true, priceVersion: serializePrice(created) });
}
