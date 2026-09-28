/**
 * Asset-domain primitives shared by generation, upload, project and future
 * external-storage workflows.
 *
 * This package intentionally does not know about React, HTTP requests,
 * providers, or database clients. Keeping these helpers pure makes asset
 * classification and naming deterministic at every ingestion boundary.
 */

export type AssetMediaKind = "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "OTHER";

export type AssetSourceType =
  "GENERATED" | "UPLOADED" | "IMPORTED" | "DERIVED" | "EXTERNAL";

export type AssetStorageProvider = "LOCAL" | "S3" | "GOOGLE_DRIVE" | "ONEDRIVE";

const DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
]);

function stripAsciiControlCharacters(value: string): string {
  let output = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint > 0x1f && codePoint !== 0x7f) output += character;
  }
  return output;
}

/**
 * Classify a verified MIME type into the stable asset media categories used by
 * the product. This must run after binary/content validation; callers must not
 * trust a browser-supplied MIME type on its own.
 */
export function classifyAssetMediaKind(mimeType: string): AssetMediaKind {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized.startsWith("image/")) return "IMAGE";
  if (normalized.startsWith("video/")) return "VIDEO";
  if (normalized.startsWith("audio/")) return "AUDIO";
  if (DOCUMENT_MIME_TYPES.has(normalized)) return "DOCUMENT";
  return "OTHER";
}

/**
 * User-facing names are metadata, never storage paths. Normalize whitespace,
 * strip control characters and cap the value to the database/UI limit.
 */
export function normalizeAssetName(
  value: string | null | undefined,
  fallback = "Untitled asset",
): string {
  const cleaned = stripAsciiControlCharacters(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
  return (cleaned || fallback).slice(0, 191);
}

/**
 * Preserve only a display-safe basename. Object keys must always be generated
 * independently by the server and must never reuse this value.
 */
export function normalizeOriginalFilename(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const basename = value.replace(/\\/g, "/").split("/").at(-1) ?? "";
  const cleaned = stripAsciiControlCharacters(basename)
    .trim()
    .replace(/\s+/g, " ");
  return cleaned ? cleaned.slice(0, 191) : null;
}

/**
 * Build a user-facing default name without leaking internal object keys.
 */
export function defaultAssetName(
  mediaKind: AssetMediaKind,
  sourceType: AssetSourceType,
): string {
  const kind =
    mediaKind === "AUDIO"
      ? "audio"
      : mediaKind === "VIDEO"
        ? "video"
        : mediaKind === "IMAGE"
          ? "image"
          : mediaKind === "DOCUMENT"
            ? "document"
            : "asset";
  return sourceType === "GENERATED"
    ? `Generated ${kind}`
    : sourceType === "UPLOADED"
      ? `Uploaded ${kind}`
      : `${kind[0]!.toUpperCase()}${kind.slice(1)}`;
}

export * from "./service";
