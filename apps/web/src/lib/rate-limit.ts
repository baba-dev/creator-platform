/**
 * Simple sliding-window rate limiter for API route handlers.
 *
 * Uses an in-memory store keyed by user ID + route. For single-instance
 * deployments this is sufficient. For horizontal scaling, replace the
 * `InMemoryRateLimitStore` with a Redis-backed implementation.
 *
 * Usage in route handlers:
 *
 * ```ts
 * import { rateLimit } from "@/lib/rate-limit";
 *
 * const limiter = rateLimit({ max: 10, windowMs: 60_000 });
 *
 * export async function POST(request: Request) {
 *   const session = await getRequestSession(request.headers);
 *   if (!session) return NextResponse.json(..., { status: 401 });
 *
 *   const limited = limiter.check(session.user.id);
 *   if (limited) return limited;
 *   ...
 * }
 * ```
 */

import { NextResponse } from "next/server";

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

/** Prune expired entries periodically to prevent unbounded memory growth. */
const PRUNE_INTERVAL_MS = 5 * 60 * 1000;

let lastPrune = Date.now();

function prune(windowMs: number): void {
  const now = Date.now();
  if (now - lastPrune < PRUNE_INTERVAL_MS) return;
  lastPrune = now;
  const cutoff = now - windowMs;
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}

interface RateLimitOptions {
  /** Maximum requests per window. */
  max: number;
  /** Sliding window duration in milliseconds. */
  windowMs: number;
  /** Optional route/action identifier for keying. Defaults to empty. */
  prefix?: string;
}

interface RateLimiter {
  /**
   * Check whether the given identifier has exceeded the rate limit.
   * Returns a 429 NextResponse if limited, or null if allowed.
   */
  check(identifier: string): NextResponse | null;
}

export function rateLimit(options: RateLimitOptions): RateLimiter {
  const { max, windowMs, prefix = "" } = options;

  return {
    check(identifier: string): NextResponse | null {
      prune(windowMs);

      const key = `${prefix}:${identifier}`;
      const now = Date.now();
      const cutoff = now - windowMs;

      let entry = store.get(key);
      if (!entry) {
        entry = { timestamps: [] };
        store.set(key, entry);
      }

      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

      if (entry.timestamps.length >= max) {
        const oldestInWindow = entry.timestamps[0]!;
        const retryAfter = Math.ceil((oldestInWindow + windowMs - now) / 1000);
        return NextResponse.json(
          { error: "Too many requests. Please wait and try again." },
          {
            status: 429,
            headers: {
              "Retry-After": String(Math.max(1, retryAfter)),
              "X-RateLimit-Limit": String(max),
              "X-RateLimit-Remaining": "0",
            },
          },
        );
      }

      entry.timestamps.push(now);

      return null;
    },
  };
}
