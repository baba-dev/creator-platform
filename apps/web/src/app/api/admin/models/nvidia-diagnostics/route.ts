import { hasPlatformPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { ProviderRequestError } from "@aiwa/providers";
import { createNvidiaProvider } from "@aiwa/providers/nvidia";
import { getRequestSession } from "@/lib/request-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

/** Read-only, admin-only model listing. Does not prove account entitlement or submit billable work. */
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const session = await getRequestSession(request.headers);
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });
  if (!hasPlatformPermission(session.user.platformRole, "models:manage")) return NextResponse.json({ error: "Access denied." }, { status: 403, headers });
  const parsed = z.string().min(1).max(128).regex(/^[a-zA-Z0-9._/-]+$/).safeParse(new URL(request.url).searchParams.get("modelId"));
  if (!parsed.success) return NextResponse.json({ error: "Invalid model identifier." }, { status: 400, headers });
  const model = await db.providerModel.findFirst({ where: { provider: "NVIDIA", providerModelId: parsed.data }, select: { id: true } });
  if (!model) return NextResponse.json({ error: "Model is not in the platform catalog." }, { status: 404, headers });
  if (!process.env.NVIDIA_API_KEY) return NextResponse.json({ status: "missing_credentials" }, { headers });
  try {
    const provider = createNvidiaProvider({
      apiKey: process.env.NVIDIA_API_KEY,
      baseUrl: process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1",
      defaultModel: process.env.NVIDIA_REASONING_MODEL ?? "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
      requestTimeoutMs: 5000, idleTimeoutMs: 5000,
    });
    const models = await provider.listModels();
    return NextResponse.json({ status: "listed", requestedModel: { id: parsed.data, available: models.includes(parsed.data) }, caveat: "Catalog listing does not verify entitlement or commercial licensing." }, { headers });
  } catch (error) {
    return NextResponse.json({ status: "inconclusive", code: error instanceof ProviderRequestError ? error.code : "DIAGNOSTIC_UNAVAILABLE" }, { headers });
  }
}
