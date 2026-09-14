import { parseServerEnv } from "@aiwa/config";

const trustedOrigin = new URL(parseServerEnv().APP_URL).origin;

export function hasTrustedMutationOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");

  if (!origin) {
    return false;
  }

  try {
    return new URL(origin).origin === trustedOrigin;
  } catch {
    return false;
  }
}
