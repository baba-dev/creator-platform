export interface TimeIdCursor {
  at: Date;
  id: string | null;
}

/**
 * Opaque, deterministic cursor for descending (timestamp, id) pagination.
 * Legacy ISO timestamp cursors remain readable for a safe rolling upgrade.
 */
export function decodeTimeIdCursor(value: string): TimeIdCursor | null {
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    if (
      typeof parsed.at === "string" &&
      typeof parsed.id === "string" &&
      parsed.id.length > 0 &&
      parsed.id.length <= 100
    ) {
      const millis = Date.parse(parsed.at);
      if (Number.isFinite(millis)) {
        return { at: new Date(millis), id: parsed.id };
      }
    }
  } catch {
    // Fall through to the legacy timestamp parser.
  }

  const legacyMillis = Date.parse(value);
  return Number.isFinite(legacyMillis)
    ? { at: new Date(legacyMillis), id: null }
    : null;
}

export function encodeTimeIdCursor(at: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ at: at.toISOString(), id }),
    "utf8",
  ).toString("base64url");
}
