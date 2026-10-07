import { hasPlatformPermission } from "@aiwa/authz";
import { ProviderRequestError } from "@aiwa/providers";
import { createGeminiProvider } from "@aiwa/providers/gemini";
import { NextResponse } from "next/server";
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
    return NextResponse.json({ status: "verified", models }, { headers });
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
