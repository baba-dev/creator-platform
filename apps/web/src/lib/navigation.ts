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

export function safeInvitationRoute(
  value: string | undefined,
  fallback: Route = "/onboarding",
): Route {
  if (!value) {
    return fallback;
  }

  const route = safeInternalRoute(value, fallback);
  if (route === fallback) {
    return fallback;
  }

  const pathname = route.split("?")[0]?.split("#")[0] ?? "";

  if (pathname === "/app" || pathname.startsWith("/app/")) {
    return route;
  }

  if (pathname.startsWith("/invite/")) {
    const token = pathname.slice("/invite/".length);
    if (token && /^[a-zA-Z0-9_-]+$/.test(token)) {
      return route;
    }
  }

  return fallback;
}
