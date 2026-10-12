import { NextResponse } from "next/server";
import { z } from "zod";
import { estimatePublicPricing } from "@/lib/public-pricing";
import { rateLimit } from "@/lib/rate-limit";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const limiter = rateLimit({
  max: 30,
  windowMs: 60_000,
  prefix: "public-pricing",
});
const schema = z
  .object({
    id: z.string().min(1).max(128),
    version: z.string().min(1).max(128),
    units: z.number().int().min(1).max(100000).optional(),
    promptTokens: z.number().int().min(0).max(1048576).optional(),
    completionTokens: z.number().int().min(0).max(1048576).optional(),
    cachedPromptTokens: z.number().int().min(0).max(1048576).optional(),
  })
  .strict();

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  const limited = await limiter.check(
    request.headers.get("cf-connecting-ip") ?? "public",
  );
  if (limited) return limited;
  const text = await request.text();
  if (text.length > 1024)
    return NextResponse.json({ error: "Request too large." }, { status: 413 });
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid estimate parameters." },
      { status: 400 },
    );
  try {
    const quote = await estimatePublicPricing(parsed.data);
    return NextResponse.json(quote, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof RangeError)
      return NextResponse.json({ error: error.message }, { status: 422 });
    return NextResponse.json(
      { error: "Estimate temporarily unavailable." },
      { status: 503 },
    );
  }
}
