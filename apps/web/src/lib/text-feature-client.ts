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

  const initialResponse = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(generateBody),
  });
  const initialBody = await responseJson(initialResponse);

  if (initialResponse.status === 200 || initialResponse.status === 201) {
    return initialBody as T;
  }

  if (initialResponse.status !== 202) {
    throw new TextFeatureRequestError(
      typeof initialBody.error === "string"
        ? initialBody.error
        : "Generation failed.",
      initialResponse.status,
    );
  }

  // Initial POST was accepted with 202; poll durable turn with authenticated read-only GET
  const pollUrl = `${url}${url.includes("?") ? "&" : "?"}clientRequestId=${encodeURIComponent(idempotencyKey)}`;
  const maxPolls = options?.maxPolls ?? 90;

  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    const delay = Math.min(800 + attempt * 150, 3_000);
    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      const getResponse = await fetch(pollUrl, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      const getBody = await responseJson(getResponse);

      if (getResponse.status === 200 && getBody.complete) {
        return getBody as T;
      }
      if (getResponse.status === 202 || (getResponse.ok && !getBody.complete)) {
        continue;
      }
      if (!getResponse.ok) {
        throw new TextFeatureRequestError(
          typeof getBody.error === "string"
            ? getBody.error
            : "Generation failed.",
          getResponse.status,
        );
      }
      return getBody as T;
    } catch (error) {
      if (error instanceof TextFeatureRequestError) throw error;
      if (attempt === maxPolls - 1) {
        throw new TextFeatureRequestError(
          "Generation is still running. The durable job was kept and can be retried safely.",
          504,
        );
      }
    }
  }

  throw new TextFeatureRequestError(
    "Generation is still running. The durable job was kept and can be retried safely.",
    504,
  );
}
