import { hasPlatformPermission } from "@aiwa/authz";
import { createCreditQuote, DEFAULT_FX_RATE } from "@aiwa/credits";
import { db } from "@aiwa/db";
import {
  cuidSchema,
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
  if (!cuidSchema.safeParse(modelId).success) {
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
    } = priceResult.data;

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

    const newPriceVersion = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM ProviderModel WHERE id = ${model.id} FOR UPDATE`;
      const currentPrice = await tx.modelPriceVersion.findFirst({
        where: { providerModelId: model.id, effectiveTo: null },
        orderBy: { effectiveFrom: "desc" },
      });
      const pricingDimension =
        priceResult.data.pricingDimension ??
        currentPrice?.pricingDimension ??
        "REQUEST";
      const unitQuantity =
        pricingDimension === "REQUEST"
          ? 1
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
