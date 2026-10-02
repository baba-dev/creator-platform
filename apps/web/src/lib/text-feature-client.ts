export interface TextFeatureQuote {
  quoteToken: string;
  expiresAt: string;
  quotedModelId: string;
  priceVersionId: string;
  providerModelId: string;
  displayName: string;
  estimatedCredits: string;
  maximumChargeCredits: string;
  contextMessages: number;
}

export class TextFeatureRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function responseJson(
  response: Response,
): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

export async function runQuotedTextFeature<T>(
  url: string,
  payload: Record<string, unknown>,
  options?: {
    onQuote?: (quote: TextFeatureQuote) => void;
    maxPolls?: number;
    idempotencyKey?: string;
  },
): Promise<T> {
  const idempotencyKey = options?.idempotencyKey ?? crypto.randomUUID();
  const quoteResponse = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      mode: "quote",
      idempotencyKey,
    }),
  });
  const quoteBody = await responseJson(quoteResponse);
  if (!quoteResponse.ok)
    throw new TextFeatureRequestError(
      typeof quoteBody.error === "string"
        ? quoteBody.error
        : "Could not prepare the generation quote.",
      quoteResponse.status,
    );
  const quote = quoteBody.quote as TextFeatureQuote | undefined;
  if (!quote?.quoteToken || !quote.quotedModelId || !quote.priceVersionId)
    throw new TextFeatureRequestError("Generation quote is incomplete.", 502);
  options?.onQuote?.(quote);

  const generateBody = {
    ...payload,
    mode: "generate",
    idempotencyKey,
    quoteToken: quote.quoteToken,
    quotedModelId: quote.quotedModelId,
    priceVersionId: quote.priceVersionId,
  };
  const maxPolls = options?.maxPolls ?? 90;

  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(generateBody),
      });
      const body = await responseJson(response);
      if (response.status === 202) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(750 + attempt * 100, 2_500)),
        );
        continue;
      }
      if (!response.ok)
        throw new TextFeatureRequestError(
          typeof body.error === "string" ? body.error : "Generation failed.",
          response.status,
        );
      return body as T;
    } catch (error) {
      if (error instanceof TextFeatureRequestError) throw error;
      if (attempt === maxPolls - 1)
        throw new TextFeatureRequestError(
          "Generation is still running. The durable job was kept and can be retried safely.",
          504,
        );
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  throw new TextFeatureRequestError(
    "Generation is still running. The durable job was kept and can be retried safely.",
    504,
  );
}
