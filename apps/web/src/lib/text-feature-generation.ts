import { estimateGeneration } from "@aiwa/credits";
import { db } from "@aiwa/db";
import {
  GenerationError,
  issueGenerationQuote,
  normalizeTextMessagesForModel,
  quoteParameters,
  type TextMessage,
} from "@aiwa/generation";

export interface TextFeatureQuoteInput {
  organizationId: string;
  userId: string;
  providerModelId: string;
  messages: TextMessage[];
  maxTokens: number;
}

export async function issueTextFeatureQuote(input: TextFeatureQuoteInput) {
  const now = new Date();
  const model = await db.providerModel.findFirst({
    where: {
      providerModelId: input.providerModelId,
      mediaKind: "TEXT",
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
  const price = model?.priceVersions[0];
  if (!model || !price)
    throw new GenerationError(
      "The selected text model is unavailable or has no active pricing.",
      409,
    );

  const messages = normalizeTextMessagesForModel(
    input.messages,
    model.capabilities,
    input.maxTokens,
  );
  const promptText = messages
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
  const estimate = estimateGeneration({
    price,
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
  expectedProviderModelId: string,
): Promise<void> {
  const model = await db.providerModel.findFirst({
    where: {
      id: quotedModelId,
      mediaKind: "TEXT",
      providerModelId: expectedProviderModelId,
    },
    select: { id: true },
  });
  if (!model)
    throw new GenerationError(
      "The quoted model does not match this creative workflow.",
      409,
    );
}
