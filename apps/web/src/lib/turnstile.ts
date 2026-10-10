/**
 * Server-side Turnstile verification; never persist or log tokens or secrets.
 * The widget alone is not an authorization boundary.
 */
export type TurnstileAction = "signup" | "password_reset";

type SiteverifyResponse = {
  success?: unknown;
  hostname?: unknown;
  action?: unknown;
};

export async function verifyTurnstileToken(
  input: {
    token: string | null | undefined;
    action: TurnstileAction;
    secret: string;
    hostname: string;
  },
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (
    typeof input.token !== "string" ||
    input.token.length === 0 ||
    input.token.length > 2048 ||
    !input.secret ||
    !input.hostname
  ) {
    return false;
  }
  try {
    const body = new URLSearchParams({
      secret: input.secret,
      response: input.token,
    });
    const response = await fetcher(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok) return false;
    const result = (await response.json()) as SiteverifyResponse;
    return (
      result.success === true &&
      result.hostname === input.hostname &&
      result.action === input.action
    );
  } catch {
    // Fail closed on provider outages, timeouts and invalid JSON.
    return false;
  }
}
