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
    /**
     * Optional authenticated read-only status resource. When omitted, the
     * helper preserves the legacy idempotent POST replay contract so feature
     * routes that only implement POST remain safe.
     */
    statusUrl?: string | ((idempotencyKey: string) => string);
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

  const statusUrl =
    typeof options?.statusUrl === "function"
      ? options.statusUrl(idempotencyKey)
      : options?.statusUrl;
  const maxPolls = options?.maxPolls ?? 90;

  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    const delay = Math.min(800 + attempt * 150, 3_000);
    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      const response = statusUrl
        ? await fetch(statusUrl, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
          })
        : await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(generateBody),
          });
      const body = await responseJson(response);

      if (response.status === 202 || (statusUrl && response.ok && body.complete === false)) {
        continue;
      }
      if (!response.ok) {
        throw new TextFeatureRequestError(
          typeof body.error === "string" ? body.error : "Generation failed.",
          response.status,
        );
      }
      return body as T;
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
