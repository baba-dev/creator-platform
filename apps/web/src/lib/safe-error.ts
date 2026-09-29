import { GenerationError } from "@aiwa/generation";
import { LedgerDomainError } from "@aiwa/credits";
import {
  OrganizationDomainError,
  StorageQuotaExceededError,
} from "@aiwa/organizations";
import { ZodError } from "zod";
import { ImageStorageError } from "@aiwa/generation/storage";

/**
 * Known domain error classes whose messages are safe to forward to API clients.
 * Unexpected errors (Prisma, filesystem, network) return a generic fallback.
 *
 * Add new domain error classes here when they are introduced in packages.
 */
const SAFE_ERROR_TYPES: ReadonlyArray<
  abstract new (...args: never[]) => Error
> = [
  GenerationError,
  LedgerDomainError,
  OrganizationDomainError,
  StorageQuotaExceededError,
  ImageStorageError,
  ZodError,
  SyntaxError,
  TypeError,
  RangeError,
];

/**
 * Well-known user-safe error message patterns thrown by business logic using
 * plain `Error`. These messages are thrown intentionally by packages and route
 * handlers and are safe to surface to users.
 */
const SAFE_MESSAGE_PATTERNS = [
  /^(Parent folder|A folder|Folder|Tag name|Project|Pending asset|Import state|Choose|Unsupported file|upload exceeds|Too many|Request key)/i,
  /quota exceeded/i,
  /already exists/i,
  /is (unavailable|required|empty)/i,
  /exceeds the \d+ (MB|GiB)/i,
  /not (found|supported|approved|configured|permitted)/i,
  /Upload (timed out|failed|exceeds)/i,
  /file type/i,
];

function isSafeMessage(message: string): boolean {
  return SAFE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Extract a safe error message for API responses. Returns the error's message
 * only when it originates from a known domain class or matches a safe pattern.
 * All other errors return the generic `fallback` to prevent leaking internal
 * details (SQL, file paths, stack traces).
 *
 * Server-side logging should still record the full error.
 */
export function safeErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  if (SAFE_ERROR_TYPES.some((type) => error instanceof type)) {
    return error.message;
  }
  if (isSafeMessage(error.message)) {
    return error.message;
  }
  return fallback;
}
