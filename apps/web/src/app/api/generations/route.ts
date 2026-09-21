import { db } from "@aiwa/db";
import {
  createImageJob,
  GenerationError,
  imageModelIds,
  priceCredits,
  requireMembership,
} from "@aiwa/generation";
import { LedgerDomainError } from "@aiwa/credits";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

function failure(error: unknown) {
  const status =
    error instanceof GenerationError
      ? error.status
      : error instanceof ZodError ||
          error instanceof SyntaxError ||
          error instanceof LedgerDomainError
        ? 400
        : 503;
  const message =
    error instanceof GenerationError || error instanceof LedgerDomainError
      ? error.message
      : status === 400
        ? "Invalid image request."
        : "Generation service unavailable. Retry with the same request.";
  return NextResponse.json({ error: message }, { status });
}
export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  if (!process.env.BYTEPLUS_API_KEY)
    return NextResponse.json(
      { error: "Image generation is not configured." },
      { status: 503 },
    );
  try {
    const text = await request.text();
    if (text.length > 12000)
      return NextResponse.json(
        { error: "Request too large." },
        { status: 413 },
      );
    const job = await createImageJob(session.user.id, JSON.parse(text));
    return NextResponse.json(
      { jobId: job.id, status: job.status },
      { status: 202 },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function GET(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const organizationId =
    new URL(request.url).searchParams.get("organizationId") ?? "";
  try {
    await requireMembership(db, organizationId, session.user.id);
    const now = new Date();
    const models = await db.providerModel.findMany({
      where: {
        enabled: true,
        provider: "BYTEPLUS",
        mediaKind: "IMAGE",
        providerModelId: { in: imageModelIds },
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
    const jobs = await db.generationJob.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        status: true,
        errorMessage: true,
        reservedCredits: true,
        chargedCredits: true,
        createdAt: true,
        providerModel: { select: { displayName: true } },
        assets: { where: { status: "READY" }, select: { id: true } },
      },
    });
    const wallet = await db.wallet.findUnique({
      where: { organizationId },
      select: { balanceCache: true },
    });
    return NextResponse.json(
      {
        configured: Boolean(process.env.BYTEPLUS_API_KEY),
        balance: wallet?.balanceCache.toString() ?? "0",
        models: models.flatMap((m) =>
          m.priceVersions[0]
            ? [
                {
                  id: m.id,
                  name: m.displayName,
                  description: m.description,
                  priceVersionId: m.priceVersions[0].id,
                  credits: priceCredits(m.priceVersions[0]).toString(),
                  capabilities: m.capabilities,
                },
              ]
            : [],
        ),
        jobs: jobs.map((j) => ({
          ...j,
          reservedCredits: j.reservedCredits.toString(),
          chargedCredits: j.chargedCredits.toString(),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
