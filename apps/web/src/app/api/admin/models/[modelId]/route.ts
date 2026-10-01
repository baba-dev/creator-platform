import { createHash } from "node:crypto";
import { hasPlatformPermission } from "@aiwa/authz";
import {
  assertFlatVideoPriceCoversWorstCase,
  createCreditQuote,
  DEFAULT_FX_RATE,
  parseTextUsageRates,
  parseUsageRates,
  selectUsageRate,
} from "@aiwa/credits";
import { db, type ModelPriceVersion } from "@aiwa/db";
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

function priceVersionResponse(price: ModelPriceVersion) {
  return {
    id: price.id,
    customerCredits: price.customerCredits.toString(),
    providerCostMicroUsd: price.providerCostMicroUsd.toString(),
    usageRates: price.usageRates,
    providerCostBasisNote: price.providerCostBasisNote,
    videoInputRate720p: price.videoInputRate720p?.toString() ?? null,
    videoInputRate1080p: price.videoInputRate1080p?.toString() ?? null,
    pricingDimension: price.pricingDimension,
    unitQuantity: price.unitQuantity.toString(),
    targetMarginBps: price.targetMarginBps,
    creditsPerBaisa: price.creditsPerBaisa.toString(),
    fxBaisaNumerator: price.fxBaisaNumerator.toString(),
    fxBaisaDenominator: price.fxBaisaDenominator.toString(),
    effectiveFrom: price.effectiveFrom.toISOString(),
  };
}

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
      fxBaisaNumerator: requestedFxNumerator,
      fxBaisaDenominator: requestedFxDenominator,
      creditsPerBaisa = 1n,
      videoInputRate720p,
      videoInputRate1080p,
      usageRates,
      providerCostBasisNote,
    } = priceResult.data;
    const publicationKey = priceResult.data.idempotencyKey;
    if (!publicationKey)
      return NextResponse.json(
        { error: "Pricing publication requires an idempotency key." },
        { status: 400 },
      );
    const publicationHash = createHash("sha256")
      .update(
        JSON.stringify(priceResult.data, (_key, value: unknown) =>
          typeof value === "bigint" ? value.toString() : value,
        ),
      )
      .digest("hex");
    const published = await db.modelPriceVersion.findUnique({
      where: { publicationKey },
    });
    if (published) {
      if (
        published.providerModelId !== model.id ||
        published.publicationHash !== publicationHash
      )
        return NextResponse.json(
          {
            error:
              "Idempotency key conflicts with another pricing publication.",
          },
          { status: 409 },
        );
      return NextResponse.json({
        ok: true,
        priceVersion: priceVersionResponse(published),
        replayed: true,
      });
    }
    if (creditsPerBaisa !== 1n)
      return NextResponse.json(
        {
          error:
            "The platform denomination is 1 credit per baisa. Use promotional grants for bonuses.",
        },
        { status: 400 },
      );

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

    const now = new Date();

    const currentPrice = await db.modelPriceVersion.findFirst({
      where: { providerModelId: model.id, effectiveTo: null },
      orderBy: { effectiveFrom: "desc" },
    });
    const fxBaisaNumerator =
      requestedFxNumerator ??
      currentPrice?.fxBaisaNumerator ??
      DEFAULT_FX_RATE.baisaNumerator;
    const fxBaisaDenominator =
      requestedFxDenominator ??
      currentPrice?.fxBaisaDenominator ??
      DEFAULT_FX_RATE.baisaDenominator;
    let quote: ReturnType<typeof createCreditQuote>;
    try {
      quote = createCreditQuote({
        providerCostMicroUsd,
        exchangeRate: {
          baisaNumerator: fxBaisaNumerator,
          baisaDenominator: fxBaisaDenominator,
        },
        targetGrossMarginBps: targetMarginBps,
        creditsPerBaisa,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid price." },
        { status: 400 },
      );
    }
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

    if (usageRates && pricingDimension !== "TOKEN")
      return NextResponse.json(
        { error: "Usage rates require TOKEN pricing." },
        { status: 400 },
      );
    if (usageRates && model.mediaKind !== "VIDEO" && model.mediaKind !== "TEXT")
      return NextResponse.json(
        {
          error: "Usage-rate tables are only valid for video or text models.",
        },
        { status: 400 },
      );
    if (pricingDimension === "TOKEN" && model.mediaKind === "TEXT") {
      try {
        parseTextUsageRates(usageRates);
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Invalid text token pricing.",
          },
          { status: 400 },
        );
      }
    }
    if (pricingDimension === "TOKEN" && model.mediaKind === "VIDEO") {
      try {
        const table = parseUsageRates(usageRates);
        const capabilities = model.capabilities as Record<
          string,
          unknown
        > | null;
        for (const row of table.rates) {
          if (capabilities?.["resolution:" + row.resolution] !== true)
            throw new Error("Rate resolution is not supported by this model.");
        }
        for (const resolution of ["480p", "720p", "1080p", "4K"]) {
          if (capabilities?.["resolution:" + resolution] === true) {
            selectUsageRate(table, resolution, false);
            if (capabilities.referenceVideo === true)
              selectUsageRate(table, resolution, true);
          }
        }
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof Error ? error.message : "Invalid token pricing.",
          },
          { status: 400 },
        );
      }
    }
    if (
      model.providerModelId.startsWith("dreamina-seedance-2-5-") &&
      pricingDimension !== "TOKEN"
    )
      return NextResponse.json(
        { error: "Seedance 2.5 requires token pricing." },
        { status: 400 },
      );

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

    let newPriceVersion: ModelPriceVersion;
    try {
      newPriceVersion = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM ProviderModel WHERE id = ${model.id} FOR UPDATE`;
        const prior = await tx.modelPriceVersion.findUnique({
          where: { publicationKey },
        });
        if (prior) {
          if (
            prior.providerModelId !== model.id ||
            prior.publicationHash !== publicationHash
          )
            throw new Error(
              "Idempotency key conflicts with another pricing publication.",
            );
          return prior;
        }
        const unitQuantity =
          pricingDimension === "TOKEN"
            ? 1000
            : pricingDimension === "REQUEST"
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
            publicationKey,
            publicationHash,
            providerCostMicroUsd,
            usageRates: usageRates ?? undefined,
            providerCostBasisNote: providerCostBasisNote ?? null,
            videoInputRate720p: videoInputRate720p ?? null,
            videoInputRate1080p: videoInputRate1080p ?? null,
            customerCredits:
              pricingDimension === "TOKEN" ? 0n : quote.customerCredits,
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
            requestId: publicationKey,
            targetType: "ModelPriceVersion",
            targetId: created.id,
            metadata: {
              providerModelId: model.id,
              displayName: model.displayName,
              customerCredits: created.customerCredits.toString(),
              providerCostMicroUsd: providerCostMicroUsd.toString(),
              usageRates: usageRates ?? null,
              providerCostBasisNote: providerCostBasisNote ?? null,
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
    } catch (error) {
      if (
        (error instanceof Error &&
          error.message.includes("Idempotency key conflicts")) ||
        (error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "P2002")
      )
        return NextResponse.json(
          {
            error:
              "Idempotency key conflicts with another pricing publication.",
          },
          { status: 409 },
        );
      throw error;
    }

    revalidatePath("/admin/models");
    revalidatePath("/app", "layout");

    return NextResponse.json({
      ok: true,
      priceVersion: priceVersionResponse(newPriceVersion),
    });
  }

  return NextResponse.json(
    {
      error: "Provide either { enabled: boolean } or price version parameters.",
    },
    { status: 400 },
  );
}
