/** Only media input fields are eligible; do not render internal request metadata. */
export function creationPrompt(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "Untitled creation";
  const fields = payload as Record<string, unknown>;
  for (const key of ["prompt", "textPrompt", "sourceText", "text"]) {
    const value = fields[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 180);
  }
  return "Untitled creation";
}
