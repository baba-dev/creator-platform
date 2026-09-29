import { hasPlatformPermission } from "@aiwa/authz";
import {
  assertFlatVideoPriceCoversWorstCase,
  createCreditQuote,
  DEFAULT_FX_RATE,
} from "@aiwa/credits";
import { db } from "@aiwa/db";
import {
  assertPricingDimensionMatchesMediaKind,
  providerModelRecordIdSchema,
  publishPriceVersionSchema,
  toggleModelEnabledSchema,
} from "@aiwa/validation";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ modelId: string }> },
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
      { error: "You do not have permission to manage models." },
      { status: 403 },
    );
  }

  const { modelId } = await params;
  if (!providerModelRecordIdSchema.safeParse(modelId).success) {
    return NextResponse.json({ error: "Model not found." }, { status: 404 });
  }

  const model = await db.providerModel.findUnique({
    where: { id: modelId },
  });

  if (!model) {
    return NextResponse.json({ error: "Model not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Invalid request payload." },
      { status: 400 },
    );
  }

  // 1. Availability toggle
  const toggleResult = toggleModelEnabledSchema.safeParse(body);
  if (toggleResult.success) {
    const updated = await db.$transaction(async (tx) => {
      const result = await tx.providerModel.update({
        where: { id: modelId },
        data: { enabled: toggleResult.data.enabled },
      });

      await tx.auditEvent.create({
        data: {
          actorUserId: session.user.id,
          action: "model.availability_toggled",
          targetType: "ProviderModel",
          targetId: model.id,
          metadata: {
            enabled: toggleResult.data.enabled,
            displayName: model.displayName,
          },
        },
      });

      return result;
    });

    revalidatePath("/admin/models");
    revalidatePath("/app", "layout");

    return NextResponse.json({
      ok: true,
      model: {
        id: updated.id,
        enabled: updated.enabled,
        displayName: updated.displayName,
      },
    });
  }

  // 2. Publish new price version
  const priceResult = publishPriceVersionSchema.safeParse(body);
  if (priceResult.success) {
    const {
      providerCostMicroUsd,
      targetMarginBps,
      fxBaisaNumerator = DEFAULT_FX_RATE.baisaNumerator,
      fxBaisaDenominator = DEFAULT_FX_RATE.baisaDenominator,
      creditsPerBaisa = 1n,
      videoInputRate720p,
      videoInputRate1080p,
    } = priceResult.data;

    if (
      (videoInputRate720p === undefined) !==
      (videoInputRate1080p === undefined)
    )
      return NextResponse.json(
        { error: "Set both video-input token rates together." },
        { status: 400 },
      );
    if (model.mediaKind !== "VIDEO" && videoInputRate720p !== undefined)
      return NextResponse.json(
        { error: "Video-input rates require a video model." },
        { status: 400 },
      );

    const quote = createCreditQuote({
      providerCostMicroUsd,
      exchangeRate: {
        baisaNumerator: fxBaisaNumerator,
        baisaDenominator: fxBaisaDenominator,
      },
      targetGrossMarginBps: targetMarginBps,
      creditsPerBaisa,
    });

    const now = new Date();

    const currentPrice = await db.modelPriceVersion.findFirst({
      where: { providerModelId: model.id, effectiveTo: null },
      orderBy: { effectiveFrom: "desc" },
    });
    const pricingDimension =
      priceResult.data.pricingDimension ??
      currentPrice?.pricingDimension ??
      "REQUEST";

    try {
      assertPricingDimensionMatchesMediaKind(model.mediaKind, pricingDimension);
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Invalid pricing dimension for model media kind.",
        },
        { status: 400 },
      );
    }

    if (model.mediaKind === "VIDEO" && pricingDimension === "REQUEST") {
      const baseUnitCost =
        currentPrice?.pricingDimension === "SECOND"
          ? currentPrice.providerCostMicroUsd
          : providerCostMicroUsd;
      try {
        assertFlatVideoPriceCoversWorstCase(
          providerCostMicroUsd,
          baseUnitCost,
          model.capabilities,
          currentPrice?.unitQuantity ?? 5,
        );
      } catch (err) {
        return NextResponse.json(
          {
            error:
              err instanceof Error
                ? err.message
                : "Flat video pricing does not cover worst supported case.",
          },
          { status: 400 },
        );
      }
    }

    const newPriceVersion = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM ProviderModel WHERE id = ${model.id} FOR UPDATE`;
      const unitQuantity =
        pricingDimension === "REQUEST"
          ? 1
          : pricingDimension === "SECOND"
            ? (priceResult.data.unitQuantity ??
              (currentPrice?.pricingDimension === "SECOND"
                ? currentPrice.unitQuantity
                : 5))
            : (priceResult.data.unitQuantity ??
              (currentPrice?.pricingDimension === "CHARACTER"
                ? currentPrice.unitQuantity
                : 1000));

      // Close out existing active price version
      await tx.modelPriceVersion.updateMany({
        where: {
          providerModelId: model.id,
          effectiveTo: null,
        },
        data: {
          effectiveTo: now,
        },
      });

      // Create new price version
      const created = await tx.modelPriceVersion.create({
        data: {
          providerModelId: model.id,
          providerCostMicroUsd,
          videoInputRate720p: videoInputRate720p ?? null,
          videoInputRate1080p: videoInputRate1080p ?? null,
          customerCredits: quote.customerCredits,
          fxBaisaNumerator,
          fxBaisaDenominator,
          targetMarginBps,
          pricingDimension,
          unitQuantity,
          creditsPerBaisa,
          effectiveFrom: now,
          effectiveTo: null,
          createdById: session.user.id,
        },
      });

      await tx.auditEvent.create({
        data: {
          actorUserId: session.user.id,
          action: "model.price_version_published",
          targetType: "ModelPriceVersion",
          targetId: created.id,
          metadata: {
            providerModelId: model.id,
            displayName: model.displayName,
            customerCredits: quote.customerCredits.toString(),
            providerCostMicroUsd: providerCostMicroUsd.toString(),
            videoInputRate720p: videoInputRate720p?.toString() ?? null,
            videoInputRate1080p: videoInputRate1080p?.toString() ?? null,
            pricingDimension,
            unitQuantity: unitQuantity.toString(),
            targetMarginBps,
            creditsPerBaisa: creditsPerBaisa.toString(),
          },
        },
      });

      return created;
    });

    revalidatePath("/admin/models");
    revalidatePath("/app", "layout");

    return NextResponse.json({
      ok: true,
      priceVersion: {
        id: newPriceVersion.id,
        customerCredits: newPriceVersion.customerCredits.toString(),
        providerCostMicroUsd: newPriceVersion.providerCostMicroUsd.toString(),
        videoInputRate720p:
          newPriceVersion.videoInputRate720p?.toString() ?? null,
        videoInputRate1080p:
          newPriceVersion.videoInputRate1080p?.toString() ?? null,
        pricingDimension: newPriceVersion.pricingDimension,
        unitQuantity: newPriceVersion.unitQuantity?.toString() ?? null,
        targetMarginBps: newPriceVersion.targetMarginBps,
        creditsPerBaisa: newPriceVersion.creditsPerBaisa.toString(),
        effectiveFrom: newPriceVersion.effectiveFrom.toISOString(),
      },
    });
  }

  return NextResponse.json(
    {
      error: "Provide either { enabled: boolean } or price version parameters.",
    },
    { status: 400 },
  );
}
