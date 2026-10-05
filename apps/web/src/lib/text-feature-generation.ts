import {
  estimateGeneration,
  normalizeLegacyTextUsageRatesForProvider,
} from "@aiwa/credits";
import { db } from "@aiwa/db";
import {
  GenerationError,
  issueGenerationQuote,
  normalizeTextMessagesForModel,
  quoteParameters,
  type TextMessage,
} from "@aiwa/generation";

type TextFeatureModelSelection =
  | { modelId: string; providerModelId?: never }
  | { providerModelId: string; modelId?: never };

export type TextFeatureQuoteInput = {
  organizationId: string;
  userId: string;
  messages: TextMessage[];
  maxTokens: number;
  responseFormat?: "text" | "json_object";
} & TextFeatureModelSelection;

async function resolveTextFeatureModel(
  selection: TextFeatureModelSelection,
  now: Date,
) {
  const activePriceWhere = {
    effectiveFrom: { lte: now },
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
  };

  if (selection.modelId) {
    const model = await db.providerModel.findFirst({
      where: {
        id: selection.modelId,
        mediaKind: "TEXT",
        enabled: true,
      },
      include: {
        priceVersions: {
          where: activePriceWhere,
          orderBy: { effectiveFrom: "desc" as const },
          take: 1,
        },
      },
    });
    if (!model?.priceVersions[0])
      throw new GenerationError(
        "The selected text model is unavailable or has no active pricing.",
        409,
      );
    return model;
  }

  const models = await db.providerModel.findMany({
    where: {
      providerModelId: selection.providerModelId,
      mediaKind: "TEXT",
      enabled: true,
      priceVersions: { some: activePriceWhere },
    },
    include: {
      priceVersions: {
        where: activePriceWhere,
        orderBy: { effectiveFrom: "desc" as const },
        take: 1,
      },
    },
    take: 2,
  });
  if (models.length !== 1 || !models[0]?.priceVersions[0]) {
    throw new GenerationError(
      models.length > 1
        ? "The legacy text model selection is ambiguous. Choose the model again."
        : "The selected text model is unavailable or has no active pricing.",
      409,
    );
  }
  return models[0];
}

export async function issueTextFeatureQuote(input: TextFeatureQuoteInput) {
  const now = new Date();
  const model = await resolveTextFeatureModel(input, now);
  const price = model.priceVersions[0]!;
  if (price.pricingDimension !== "TOKEN") {
    throw new GenerationError(
      "Paid text generation requires token pricing for this model.",
      409,
    );
  }
  let effectivePrice = price;
  if (price.usageRates != null) {
    try {
      effectivePrice = {
        ...price,
        usageRates: normalizeLegacyTextUsageRatesForProvider(
          price.usageRates,
          model.provider,
        ),
      };
    } catch {
      throw new GenerationError(
        "The selected text model does not have valid provider token rates.",
        409,
      );
    }
  }

  const messages = normalizeTextMessagesForModel(
    input.messages,
    model.capabilities,
    input.maxTokens,
  );
  const promptText = messages
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
  const estimate = estimateGeneration({
    price: effectivePrice,
    mediaKind: "TEXT",
    providerModelId: model.providerModelId,
    text: promptText,
    units: input.maxTokens,
  });
  const signed = issueGenerationQuote(
    {
      organizationId: input.organizationId,
      userId: input.userId,
      modelId: model.id,
      priceVersionId: price.id,
      parameters: quoteParameters("TEXT", {
        text: promptText,
        units: input.maxTokens,
        responseFormat: input.responseFormat ?? "text",
      }),
    },
    estimate.reservation.customerCredits,
    now,
  );

  return {
    quoteToken: signed.quoteToken,
    expiresAt: signed.expiresAt,
    quotedModelId: model.id,
    priceVersionId: price.id,
    providerModelId: model.providerModelId,
    displayName: model.displayName,
    estimatedCredits: estimate.quote.customerCredits.toString(),
    maximumChargeCredits: estimate.reservation.customerCredits.toString(),
    contextMessages: messages.length,
  };
}

export async function assertQuotedTextModel(
  quotedModelId: string,
  expectedModelSelection: string,
): Promise<void> {
  const model = await db.providerModel.findFirst({
    where: {
      id: quotedModelId,
      mediaKind: "TEXT",
    },
    select: { id: true, providerModelId: true },
  });
  if (
    !model ||
    (model.id !== expectedModelSelection &&
      model.providerModelId !== expectedModelSelection)
  )
    throw new GenerationError(
      "The quoted model does not match this creative workflow.",
      409,
    );
}
