import { GenerationError } from "@aiwa/generation";
import { LedgerDomainError } from "@aiwa/credits";
import {
  OrganizationDomainError,
  StorageQuotaExceededError,
} from "@aiwa/organizations";
import { ZodError } from "zod";
import { ImageStorageError } from "@aiwa/generation/storage";

/**
 * Known domain error classes whose messages are intentionally designed and safe
 * to forward to API clients.
 *
 * System, runtime (TypeError, SyntaxError, RangeError), Prisma, and filesystem
 * errors are strictly excluded and will always return the fallback message.
 */
const DOMAIN_ERROR_TYPES: ReadonlyArray<
  abstract new (...args: never[]) => Error
> = [
  GenerationError,
  LedgerDomainError,
  OrganizationDomainError,
  StorageQuotaExceededError,
  ImageStorageError,
];

/**
 * Exact, whitelisted client-safe error messages thrown by library operations using
 * standard Error. Using an exact Set prevents any possibility of accidentally
 * matching internal filesystem paths, SQL fragments, or provider secrets.
 */
const EXACT_SAFE_CLIENT_MESSAGES = new Set([
  "Parent folder is unavailable.",
  "A folder with this name already exists here.",
  "Import state changed.",
  "File exceeds 100 MB.",
  "Choose an MP4, MP3 or WAV file.",
  "Linked file is not a supported MP4.",
  "Project is unavailable.",
  "Folder is unavailable.",
  "Request key was reused.",
  "Edit unavailable.",
  "Save the latest edit before rendering.",
  "Uploaded file is empty.",
  "Too many assets selected.",
  "Tag name is required.",
  "Video or audio must be between 0.1 and 120 seconds.",
  "Unsupported video codec or dimensions.",
  "Audio track is missing.",
  "Unsupported audio codec.",
  "Image dimensions exceed the supported editing limit.",
  "Crop must remain inside the source image.",
  "Pending asset no longer exists.",
  "Asset storage quota exceeded.",
]);

/**
 * Detects patterns that indicate internal stack traces, system paths, or SQL queries.
 */
function containsSystemLeak(message: string): boolean {
  return (
    message.includes("\n") ||
    message.includes("    at ") ||
    message.includes("node:") ||
    message.includes("node_modules") ||
    message.includes("SELECT ") ||
    message.includes("INSERT ") ||
    message.includes("UPDATE ") ||
    message.includes("DELETE ") ||
    /(\/|\\)[a-zA-Z0-9_\-\.]+/.test(message)
  );
}

/**
 * Extract a safe error message for API responses.
 *
 * Returns the message only if:
 * 1. It is an instance of a known application DomainError (and doesn't leak paths/SQL)
 * 2. It is a ZodError (formatted cleanly without internal schema dumps)
 * 3. It matches an exact whitelisted user-facing business message
 *
 * All other errors (TypeError, SyntaxError, Prisma, network, FS) return `fallback`.
 */
export function safeErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;

  // Handle validation errors with clean field-level message
  if (error instanceof ZodError) {
    const first = error.issues[0];
    if (first) {
      const field = first.path.length > 0 ? `${first.path.join(".")}: ` : "";
      const msg = `${field}${first.message}`;
      return containsSystemLeak(msg) ? fallback : msg;
    }
    return "Invalid request parameters.";
  }

  // Handle intentional domain error types
  if (DOMAIN_ERROR_TYPES.some((type) => error instanceof type)) {
    return containsSystemLeak(error.message) ? fallback : error.message;
  }

  // Handle exact whitelisted domain messages
  if (EXACT_SAFE_CLIENT_MESSAGES.has(error.message)) {
    return error.message;
  }

  // Safe fallback for all unexpected / runtime / library / system errors
  return fallback;
}
