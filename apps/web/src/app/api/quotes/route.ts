import { hasOrganizationPermission, hasPlatformPermission } from "@aiwa/authz";
import {
  estimateAuthorizedGeneration,
  QuoteValidationError,
  issueGenerationQuote,
  quoteParameters,
} from "@aiwa/generation";
import { formatBaisa } from "@/lib/format-baisa";
import { db } from "@aiwa/db";
import { checkMemberSpendingBudget } from "@aiwa/organizations";
import { quoteRequestSchema } from "@aiwa/validation";
import { creativeLocaleIntentSchema } from "@aiwa/generation/locale";
import { NextResponse } from "next/server";

import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

export async function POST(request: Request): Promise<NextResponse> {
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

  const requestText = await request.text();
  if (requestText.length > 16_000) {
    return NextResponse.json({ error: "Request too large." }, { status: 413 });
  }
  const body = (() => {
    try {
      return JSON.parse(requestText) as unknown;
    } catch {
      return null;
    }
  })();
  const parsed = quoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid quote parameters.", details: parsed.error.format() },
      { status: 400 },
    );
  }

  if (parsed.data.localeIntent && !creativeLocaleIntentSchema.safeParse(parsed.data.localeIntent).success) {
    return NextResponse.json({ error: "Invalid creative locale." }, { status: 400 });
  }

  const { organizationId, modelId, referenceVideoAssetId } = parsed.data;

  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId: session.user.id,
      },
    },
    include: {
      organization: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (!membership || membership.organization.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "Organization not found or inactive." },
      { status: 404 },
    );
  }

  const canView =
    hasOrganizationPermission(membership.role, "workspace:view") ||
    hasOrganizationPermission(membership.role, "generation:create");

  if (!canView) {
    return NextResponse.json(
      {
        error:
          "You do not have permission to quote generation in this organization.",
      },
      { status: 403 },
    );
  }

  const now = new Date();
  const model = await db.providerModel.findFirst({
    where: {
      OR: [{ id: modelId }, { providerModelId: modelId }],
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

  if (!model) {
    return NextResponse.json(
      { error: "Model not found or disabled." },
      { status: 404 },
    );
  }

  const activePriceVersion = model.priceVersions[0];
  if (!activePriceVersion) {
    return NextResponse.json(
      { error: "Model has no active pricing version." },
      { status: 400 },
    );
  }
  if (referenceVideoAssetId && model.mediaKind !== "VIDEO")
    return NextResponse.json(
      { error: "Video reference requires a video model." },
      { status: 400 },
    );

  let estimate: Awaited<ReturnType<typeof estimateAuthorizedGeneration>>;
  try {
    estimate = await estimateAuthorizedGeneration(
      model,
      activePriceVersion,
      parsed.data,
      organizationId,
      session.user.id,
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Quote is unavailable.",
      },
      { status: error instanceof QuoteValidationError ? error.status : 409 },
    );
  }
  const budget = await checkMemberSpendingBudget({
    organizationId,
    userId: session.user.id,
    proposedCredits: estimate.reservation.customerCredits,
    date: now,
  });
  const wallet = await db.wallet.findUnique({
    where: { organizationId },
    select: { balanceCache: true },
  });
  const available = wallet?.balanceCache ?? 0n;
  const reservation = estimate.reservation;
  const signedQuote = issueGenerationQuote(
    {
      organizationId,
      userId: session.user.id,
      modelId: model.id,
      priceVersionId: activePriceVersion.id,
      parameters: quoteParameters(model.mediaKind, parsed.data),
    },
    reservation.customerCredits,
    now,
  );
  const commercial = hasPlatformPermission(
    session.user.platformRole,
    "payments:read",
  );
  return NextResponse.json(
    {
      quote: {
        ...signedQuote,
        createdAt: now.toISOString(),
        currency: "OMR",
        modelId: model.id,
        providerModelId: model.providerModelId,
        displayName: model.displayName,
        mediaKind: model.mediaKind,
        priceVersionId: activePriceVersion.id,
        pricingDimension: activePriceVersion.pricingDimension,
        unitQuantity: activePriceVersion.unitQuantity.toString(),
        units: estimate.units,
        billableQuantity: estimate.billableQuantity,
        // Legacy fields remain reservation-based so existing clients do not under-reserve.
        customerPriceBaisa: reservation.customerPriceBaisa.toString(),
        customerCredits: reservation.customerCredits.toString(),
        creditsPerBaisa: activePriceVersion.creditsPerBaisa.toString(),
        estimatedCredits: estimate.quote.customerCredits.toString(),
        estimatedPriceBaisa: estimate.quote.customerPriceBaisa.toString(),
        estimatedOmr: formatBaisa(estimate.quote.customerPriceBaisa),
        reservationCredits: reservation.customerCredits.toString(),
        maximumChargeCredits: reservation.customerCredits.toString(),
        maximumChargeBaisa: reservation.customerPriceBaisa.toString(),
        maximumChargeOmr: formatBaisa(reservation.customerPriceBaisa),
        estimatedUsage: {
          unit:
            estimate.estimatedTokens === null
              ? model.mediaKind === "VOICE"
                ? "CHARACTER"
                : model.mediaKind === "VIDEO" &&
                    activePriceVersion.pricingDimension === "SECOND"
                  ? "SECOND"
                  : "IMAGE"
              : model.mediaKind === "TEXT"
                ? "TOKEN"
                : "COMPLETION_TOKEN",
          quantity:
            estimate.estimatedTokens?.toString() ??
            estimate.billableQuantity.toString(),
          isEstimate: estimate.estimatedTokens !== null,
        },
        settlement: estimate.settlement,
        chargeRangeCredits: {
          minimum:
            estimate.settlement === "ACTUAL_USAGE" ||
            model.mediaKind === "IMAGE"
              ? "0"
              : estimate.quote.customerCredits.toString(),
          maximum: reservation.customerCredits.toString(),
        },
        estimationPolicy:
          activePriceVersion.pricingDimension === "TOKEN"
            ? activePriceVersion.usageRates &&
              typeof activePriceVersion.usageRates === "object" &&
              !Array.isArray(activePriceVersion.usageRates) &&
              "estimator" in activePriceVersion.usageRates
              ? String(
                  (activePriceVersion.usageRates as Record<string, unknown>)
                    .estimator,
                )
              : "token-usage-v1"
            : "configured-unit-v1",
        confidence:
          estimate.estimatedTokens === null ? "FIXED_QUOTE" : "ESTIMATE",
        roundingPolicy: "PER_IMAGE_OR_JOB_BAISA_CEIL_V1",
        ...(commercial
          ? {
              providerCostMicroUsd:
                estimate.quote.providerCostMicroUsd.toString(),
              reservationProviderCostMicroUsd:
                reservation.providerCostMicroUsd.toString(),
              convertedCostBaisa: estimate.quote.convertedCostBaisa.toString(),
              targetGrossMarginBps: activePriceVersion.targetMarginBps,
              costBasis:
                estimate.estimatedTokens === null
                  ? "CONFIGURED_RATE"
                  : "ESTIMATED_TOKENS",
              providerCostBasisNote: activePriceVersion.providerCostBasisNote,
            }
          : {}),
      },
      wallet: {
        availableCredits: available.toString(),
        canAfford: available >= reservation.customerCredits,
        balanceAfterReservationCredits: (
          available - reservation.customerCredits
        ).toString(),
      },
      budget: {
        monthlyCapCredits: budget.monthlyCapCredits?.toString() ?? null,
        currentMonthSpentCredits: budget.currentMonthSpentCredits.toString(),
        proposedCredits: budget.proposedCredits.toString(),
        canSpend: budget.canSpend,
        remainingCredits: budget.remainingCredits?.toString() ?? null,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
