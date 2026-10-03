import { hasOrganizationPermission } from "@aiwa/authz";
import {
  calculateBillableUnits,
  checkMemberSpendingBudget,
} from "@aiwa/credits";
import { db } from "@aiwa/db";
import {
  issueGenerationQuote,
  priceCredits,
  quoteParameters,
} from "@aiwa/generation";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import {
  getAvailableStudioModels,
  selectStudioModelBySelection,
  StudioModelUnavailableError,
} from "@/lib/studio-model-discovery";

const schema = z
  .object({
    organizationId: z.string().min(1).max(100),
    modelId: z.string().min(1).max(100),
    sourceAssetId: z.string().min(1).max(100),
    language: z.string().trim().min(2).max(20).optional(),
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

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid transcription quote request." },
      { status: 400 },
    );

  const input = parsed.data;
  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: session.user.id,
      },
    },
    include: { organization: true },
  });
  if (
    !membership ||
    membership.organization.status !== "ACTIVE" ||
    !hasOrganizationPermission(membership.role, "generation:create")
  )
    return NextResponse.json({ error: "Access denied." }, { status: 403 });

  const discovery = await getAvailableStudioModels("transcription");
  let selected;
  try {
    selected = selectStudioModelBySelection(discovery, input.modelId);
  } catch (error) {
    if (error instanceof StudioModelUnavailableError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }

  const [source, price] = await Promise.all([
    db.asset.findFirst({
      where: {
        id: input.sourceAssetId,
        organizationId: input.organizationId,
        status: "READY",
        mediaKind: { in: ["AUDIO", "VIDEO"] },
      },
      select: {
        id: true,
        name: true,
        originalFilename: true,
        mimeType: true,
        byteSize: true,
        durationMs: true,
      },
    }),
    db.modelPriceVersion.findUnique({
      where: { id: selected.pricing.priceVersionId },
    }),
  ]);

  if (
    !source ||
    source.durationMs === null ||
    source.durationMs <= 0 ||
    source.byteSize <= 0n ||
    source.byteSize > 25n * 1024n * 1024n
  )
    return NextResponse.json(
      {
        error:
          "Choose a ready audio or video asset under 25 MB with a valid duration.",
      },
      { status: 400 },
    );

  if (
    !price ||
    price.providerModelId !== selected.id ||
    price.providerCostMicroUsd <= 0n ||
    (price.pricingDimension !== "SECOND" &&
      price.pricingDimension !== "REQUEST")
  )
    return NextResponse.json(
      { error: "Transcription pricing is unavailable." },
      { status: 409 },
    );

  const billableSeconds = Math.max(1, Math.ceil(source.durationMs / 1000));
  const units =
    price.pricingDimension === "SECOND"
      ? calculateBillableUnits(
          BigInt(billableSeconds),
          BigInt(price.unitQuantity),
        )
      : 1n;
  const providerCostMicroUsd = price.providerCostMicroUsd * units;
  const customerCredits = priceCredits({
    ...price,
    providerCostMicroUsd,
  });
  const now = new Date();
  const signed = issueGenerationQuote(
    {
      organizationId: input.organizationId,
      userId: session.user.id,
      modelId: selected.id,
      priceVersionId: price.id,
      parameters: quoteParameters("VOICE", {
        transcription: true,
        sourceAssetId: source.id,
        language: input.language,
        billableQuantity: billableSeconds,
      }),
    },
    customerCredits,
    now,
  );

  const [wallet, budget] = await Promise.all([
    db.wallet.findUnique({
      where: { organizationId: input.organizationId },
      select: { balanceCache: true },
    }),
    checkMemberSpendingBudget({
      organizationId: input.organizationId,
      userId: session.user.id,
      proposedCredits: customerCredits,
      date: now,
    }),
  ]);
  const available = wallet?.balanceCache ?? 0n;

  return NextResponse.json(
    {
      quote: {
        ...signed,
        modelId: selected.id,
        priceVersionId: price.id,
        pricingDimension: price.pricingDimension,
        unitQuantity: price.unitQuantity.toString(),
        billableSeconds,
        billingUnits: units.toString(),
        estimatedCredits: customerCredits.toString(),
        reservationCredits: customerCredits.toString(),
        provider: selected.provider,
        providerModelId: selected.providerModelId,
        displayName: selected.name,
      },
      source: {
        ...source,
        byteSize: source.byteSize.toString(),
      },
      wallet: {
        availableCredits: available.toString(),
        canAfford: available >= customerCredits,
      },
      budget: {
        canSpend: budget.canSpend,
        monthlyCapCredits: budget.monthlyCapCredits?.toString() ?? null,
        currentMonthSpentCredits: budget.currentMonthSpentCredits.toString(),
        remainingCredits: budget.remainingCredits?.toString() ?? null,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
