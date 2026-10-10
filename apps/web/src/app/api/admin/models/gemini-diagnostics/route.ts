import { hasPlatformPermission } from "@aiwa/authz";
import { ProviderRequestError } from "@aiwa/providers";
import { createGeminiProvider } from "@aiwa/providers/gemini";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestSession } from "@/lib/request-auth";

// Model listing is read-only and never submits generation or reserves credits.
export async function GET(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  if (!hasPlatformPermission(session.user.platformRole, "models:manage"))
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const headers = { "Cache-Control": "private, no-store" };
  const rawModelId = new URL(request.url).searchParams.get("modelId");
  const parsedModelId =
    rawModelId === null
      ? null
      : z
          .string()
          .min(1)
          .max(128)
          .regex(/^[a-zA-Z0-9._/-]+$/)
          .safeParse(rawModelId);
  if (parsedModelId !== null && !parsedModelId.success) {
    return NextResponse.json(
      { error: "Invalid model identifier." },
      { status: 400, headers },
    );
  }
  const modelId = parsedModelId?.success
    ? parsedModelId.data.replace(/^models\//, "")
    : null;
  if (!process.env.GEMINI_API_KEY)
    return NextResponse.json({ status: "missing_credentials" }, { headers });
  try {
    const provider = createGeminiProvider({
      apiKey: process.env.GEMINI_API_KEY,
      baseUrl: process.env.GEMINI_BASE_URL,
      requestTimeoutMs: 5000,
      idleTimeoutMs: 5000,
    });
    const models = await provider.listModels();
    return NextResponse.json(
      {
        status: "verified",
        models,
        ...(modelId !== null
          ? {
              requestedModel: {
                id: modelId,
                available: models.some(
                  (candidate) => candidate.replace(/^models\//, "") === modelId,
                ),
              },
            }
          : {}),
      },
      { headers },
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "provider_rejected",
        code:
          error instanceof ProviderRequestError
            ? error.code
            : "DIAGNOSTIC_UNAVAILABLE",
      },
      { headers },
    );
  }
}
