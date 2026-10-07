import {
  WORKSPACE_SECONDARY_ITEMS,
  WORKSPACE_TOOLS,
} from "@/lib/workspace-tools";

const toolSegments = WORKSPACE_TOOLS.map((item) => item.segment);
const secondarySegments = WORKSPACE_SECONDARY_ITEMS.map((item) => item.segment);

const pages = new Set([
  "",
  ...toolSegments.filter((segment) => !segment.includes("/")),
  ...secondarySegments.filter((segment) => !segment.includes("/")),
  "conversations",
  // Backward-compatible alias. The route redirects to Brand & Story's story tab.
  "story-planning",
]);

const nestedPages = new Set(
  toolSegments.filter((segment) => segment.includes("/")),
);

const resourcePages = new Set([
  "history",
  "projects",
  "templates",
  "conversations",
]);

export function safePixelRoute(route: string, slug: string): string | null {
  if (
    /[\\\u0000-\u0020]/.test(route) ||
    route.startsWith("//") ||
    /%(?:2f|5c|2e)/i.test(route)
  )
    return null;

  const base = `/app/${encodeURIComponent(slug)}`;
  const candidate = route.startsWith("/app/")
    ? route
    : `${base}/${route.replace(/^\//, "")}`;
  const url = new URL(candidate, "https://pixel.invalid");

  if (
    url.origin !== "https://pixel.invalid" ||
    (url.pathname !== base && !url.pathname.startsWith(`${base}/`))
  )
    return null;

  const relative = url.pathname.slice(base.length).replace(/^\//, "");
  const parts = relative.split("/");
  const root = parts[0] ?? "";
  const isRootPage = parts.length === 1 && pages.has(root);
  const isNestedPage = parts.length === 2 && nestedPages.has(relative);
  const isResourcePage =
    parts.length === 2 && resourcePages.has(root) && Boolean(parts[1]);

  if (!isRootPage && !isNestedPage && !isResourcePage) return null;
  if (route.includes("..")) return null;
  return url.pathname + url.search;
}
