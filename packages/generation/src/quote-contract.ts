import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

export const QUOTE_LIFETIME_MS = 5 * 60_000;
export interface QuoteContext {
  organizationId: string;
  userId: string;
  modelId: string;
  priceVersionId: string;
  parameters: Record<string, unknown>;
}
function fingerprint(context: QuoteContext): string {
  return createHash("sha256").update(JSON.stringify(context)).digest("hex");
}
function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32)
    throw new Error("Quote signing is unavailable.");
  return value;
}
export function issueGenerationQuote(
  context: QuoteContext,
  maximumCredits: bigint,
  now = new Date(),
) {
  const expiresAt = new Date(now.getTime() + QUOTE_LIFETIME_MS).toISOString();
  const quoteId = randomUUID();
  const body = Buffer.from(
    JSON.stringify({
      quoteId,
      expiresAt,
      fingerprint: fingerprint(context),
      maximumCredits: maximumCredits.toString(),
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret())
    .update(body)
    .digest("base64url");
  return { quoteId, expiresAt, quoteToken: body + "." + signature };
}
export function verifyGenerationQuote(
  token: string | undefined,
  context: QuoteContext,
  reservationCredits: bigint,
  now = new Date(),
): void {
  // Existing integrations remain supported; all prices are still recomputed and reserved server-side.
  if (!token) return;
  try {
    if (token.length > 2048) throw new Error();
    const [body, signature, extra] = token.split(".");
    if (!body || !signature || extra) throw new Error();
    const expected = createHmac("sha256", secret()).update(body).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new Error();
    const quote = JSON.parse(
      Buffer.from(body, "base64url").toString(),
    ) as Record<string, unknown>;
    const expires =
      typeof quote.expiresAt === "string" ? Date.parse(quote.expiresAt) : NaN;
    if (
      !Number.isFinite(expires) ||
      expires <= now.getTime() ||
      expires > now.getTime() + QUOTE_LIFETIME_MS ||
      quote.fingerprint !== fingerprint(context) ||
      typeof quote.maximumCredits !== "string" ||
      !/^\d+$/.test(quote.maximumCredits) ||
      reservationCredits > BigInt(quote.maximumCredits)
    )
      throw new Error();
  } catch {
    throw new RangeError(
      "Quote expired or settings changed. Refresh the estimate before generating.",
    );
  }
}
/** Canonical parameters shared by previews and admissions; prompt content is not stored in quotes. */
export function quoteParameters(
  mediaKind: string,
  input: {
    units?: number;
    outputCount?: number;
    text?: string;
    billableQuantity?: number;
    durationSeconds?: number;
    resolution?: string;
    aspectRatio?: string;
    generateAudio?: boolean;
    referenceVideoAssetId?: string;
    firstFrameAssetId?: string;
    lastFrameAssetId?: string;
    referenceAssetIds?: string[];
    schemaVersion?: number;
    workflow?: string;
    sources?: Array<{ assetId: string; role: string; position: number }>;
    outputFormat?: string;
    returnLastFrame?: boolean;
    seed?: number;
    sourceDraftJobId?: string;
    extensionDirection?: string;
    sourceAssetId?: string;
    language?: string;
    transcription?: boolean;
  },
): Record<string, unknown> {
  if (mediaKind === "VIDEO") {
    const sources = Array.isArray(input.sources)
      ? [...input.sources]
          .sort((a, b) => a.position - b.position)
          .map(({ assetId, role, position }) => ({ assetId, role, position }))
      : undefined;
    return {
      schemaVersion: input.schemaVersion ?? (sources ? 2 : 1),
      workflow: input.workflow ?? null,
      durationSeconds: input.durationSeconds ?? 5,
      resolution: input.resolution ?? "720p",
      aspectRatio: input.aspectRatio ?? "16:9",
      generateAudio: input.generateAudio ?? false,
      outputFormat: input.outputFormat ?? "mp4",
      returnLastFrame: input.returnLastFrame ?? true,
      seed: input.seed ?? null,
      sourceDraftJobId: input.sourceDraftJobId ?? null,
      extensionDirection: input.extensionDirection ?? null,
      sources: sources ?? [
        ...(input.firstFrameAssetId
          ? [
              {
                assetId: input.firstFrameAssetId,
                role: "FIRST_FRAME",
                position: 0,
              },
            ]
          : []),
        ...(input.lastFrameAssetId
          ? [
              {
                assetId: input.lastFrameAssetId,
                role: "LAST_FRAME",
                position: 1,
              },
            ]
          : []),
        ...(input.referenceVideoAssetId
          ? [
              {
                assetId: input.referenceVideoAssetId,
                role: "REFERENCE_VIDEO",
                position: 2,
              },
            ]
          : []),
      ],
    };
  }
  if (mediaKind === "VOICE")
    return input.transcription
      ? {
          transcription: true,
          sourceAssetId: input.sourceAssetId ?? null,
          language: input.language ?? null,
          billableQuantity: input.billableQuantity ?? null,
        }
      : {
          textHash:
            input.text === undefined
              ? null
              : createHash("sha256").update(input.text.trim()).digest("hex"),
          billableQuantity:
            input.text === undefined ? (input.billableQuantity ?? null) : null,
        };
  if (mediaKind === "TEXT")
    return {
      textHash:
        input.text === undefined
          ? null
          : createHash("sha256").update(input.text.trim()).digest("hex"),
      units: input.units ?? 1024,
      billableQuantity:
        input.text === undefined ? (input.billableQuantity ?? null) : null,
    };
  return {
    units: input.outputCount ?? input.units ?? 1,
    resolution: input.resolution ?? "2K",
    aspectRatio: input.aspectRatio ?? "1:1",
    referenceAssetIds: input.referenceAssetIds ?? [],
  };
}
