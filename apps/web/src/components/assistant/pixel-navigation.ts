const pages = new Set([
  "",
  "image",
  "video",
  "speech",
  "assets",
  "history",
  "storage",
  "members",
  "chat",
  "projects",
  "templates",
  "director",
  "scripts",
  "brand-assistants",
  "story-planning",
  "spokesperson",
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
  const parts = url.pathname.slice(base.length).replace(/^\//, "").split("/");
  if (
    !pages.has(parts[0] ?? "") ||
    parts.length > 2 ||
    (parts.length === 2 &&
      !["history", "projects", "templates", "conversations"].includes(
        parts[0] ?? "",
      ))
  )
    return null;
  if (route.includes("..")) return null;
  return url.pathname + url.search;
}
