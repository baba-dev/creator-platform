import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

const handlers = toNextJsHandler(auth);
const PASSWORD_RESET_PATH = "/api/auth/request-password-reset";
export const PASSWORD_RESET_RESPONSE_FLOOR_MS = 500;

export const GET = handlers.GET;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function applyPasswordResetResponseFloor(startedAt: number) {
  const remaining =
    PASSWORD_RESET_RESPONSE_FLOOR_MS - (performance.now() - startedAt);
  if (remaining > 0) await sleep(remaining);
}

function genericPasswordResetResponse() {
  return Response.json(
    {
      status: true,
      message:
        "If an account exists for that email, password reset instructions have been sent.",
    },
    {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

export async function POST(request: Request) {
  const isPasswordReset = new URL(request.url).pathname === PASSWORD_RESET_PATH;

  if (!isPasswordReset) return handlers.POST(request);

  const startedAt = performance.now();
  try {
    const response = await handlers.POST(request);
    await applyPasswordResetResponseFloor(startedAt);

    // The reset endpoint must not disclose an account-specific outbox failure.
    // Rate-limit and caller-validation responses remain intact, while internal
    // failures are normalized to the same public success envelope.
    if (response.status >= 500) {
      console.error("Password reset request failed after auth processing.", {
        status: response.status,
      });
      return genericPasswordResetResponse();
    }

    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "private, no-store");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    await applyPasswordResetResponseFloor(startedAt);
    console.error("Password reset request failed before response.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : "Unknown",
    });
    return genericPasswordResetResponse();
  }
}
