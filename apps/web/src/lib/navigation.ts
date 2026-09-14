import type { Route } from "next";

const internalOrigin = "https://internal.aiwa.invalid";

export function safeInternalRoute(
  value: string | undefined,
  fallback: Route = "/app",
): Route {
  if (!value) {
    return fallback;
  }

  try {
    const url = new URL(value, internalOrigin);

    if (url.origin !== internalOrigin) {
      return fallback;
    }

    return `${url.pathname}${url.search}${url.hash}` as Route;
  } catch {
    return fallback;
  }
}
