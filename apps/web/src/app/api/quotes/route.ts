import { hasOrganizationPermission } from "@aiwa/authz";
import { calculateBillableUnits, createCreditQuote } from "@aiwa/credits";
import { db } from "@aiwa/db";
import { checkMemberSpendingBudget } from "@aiwa/organizations";
import { quoteRequestSchema } from "@aiwa/validation";
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

  const body = await request.json().catch(() => null);
  const parsed = quoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid quote parameters.", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const { organizationId, modelId, units, billableQuantity } = parsed.data;

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

  const effectiveUnits =
    activePriceVersion.pricingDimension === "CHARACTER" &&
    typeof billableQuantity === "number"
      ? Number(
          calculateBillableUnits(
            BigInt(billableQuantity),
            BigInt(activePriceVersion.unitQuantity ?? 1000),
          ),
        )
      : units;

  const scaledProviderCostMicroUsd =
    activePriceVersion.providerCostMicroUsd * BigInt(effectiveUnits);

  const quote = createCreditQuote({
    providerCostMicroUsd: scaledProviderCostMicroUsd,
    exchangeRate: {
      baisaNumerator: activePriceVersion.fxBaisaNumerator,
      baisaDenominator: activePriceVersion.fxBaisaDenominator,
    },
    targetGrossMarginBps: activePriceVersion.targetMarginBps,
    creditsPerBaisa: 1n,
  });

  const budget = await checkMemberSpendingBudget({
    organizationId,
    userId: session.user.id,
    proposedCredits: quote.customerCredits,
    date: now,
  });

  return NextResponse.json({
    quote: {
      modelId: model.id,
      providerModelId: model.providerModelId,
      displayName: model.displayName,
      mediaKind: model.mediaKind,
      priceVersionId: activePriceVersion.id,
      pricingDimension: activePriceVersion.pricingDimension,
      unitQuantity: activePriceVersion.unitQuantity?.toString() ?? null,
      units: effectiveUnits,
      billableQuantity: billableQuantity ?? null,
      providerCostMicroUsd: quote.providerCostMicroUsd.toString(),
      convertedCostBaisa: quote.convertedCostBaisa.toString(),
      customerPriceBaisa: quote.customerPriceBaisa.toString(),
      customerCredits: quote.customerCredits.toString(),
      targetGrossMarginBps: quote.targetGrossMarginBps,
    },
    budget: {
      monthlyCapCredits: budget.monthlyCapCredits?.toString() ?? null,
      currentMonthSpentCredits: budget.currentMonthSpentCredits.toString(),
      proposedCredits: budget.proposedCredits.toString(),
      canSpend: budget.canSpend,
      remainingCredits: budget.remainingCredits?.toString() ?? null,
    },
  });
}
