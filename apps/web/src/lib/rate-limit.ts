import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getRedisClient } from "./redis";
import type Redis from "ioredis";

export type RateLimitFailureMode = "memory" | "closed";

export interface RateLimitOptions {
  /** Maximum number of allowed requests in the time window */
  max: number;
  /** Sliding window size in milliseconds (e.g. 60_000 for 1 minute) */
  windowMs: number;
  /** Prefix for the Redis rate limit key (e.g. "generation") */
  prefix: string;
  /**
   * Behavior when Redis is unavailable.
   * "memory" preserves availability with a per-process limiter.
   * "closed" rejects the request and is appropriate for sensitive financial/admin mutations.
   */
  failureMode?: RateLimitFailureMode;
  /** Optional custom Redis client (useful for unit testing) */
  redisClient?: Redis;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
  unavailable?: boolean;
}

export interface RateLimiter {
  check(identifier: string): Promise<NextResponse | null>;
  evaluate(identifier: string): Promise<RateLimitResult>;
}

interface MemoryEntry {
  timestamps: number[];
  windowMs: number;
  expiresAt: number;
}
const memoryFallbackStore = new Map<string, MemoryEntry>();
const MEMORY_PRUNE_INTERVAL_MS = 5 * 60_000;
let lastMemoryPrune = 0;

function maybeCleanMemoryStore(now: number) {
  if (now - lastMemoryPrune < MEMORY_PRUNE_INTERVAL_MS) return;
  lastMemoryPrune = now;

  for (const [key, entry] of memoryFallbackStore.entries()) {
    if (entry.expiresAt <= now) {
      memoryFallbackStore.delete(key);
      continue;
    }
    entry.timestamps = entry.timestamps.filter(
      (timestamp) => now - timestamp < entry.windowMs,
    );
    if (entry.timestamps.length === 0) memoryFallbackStore.delete(key);
  }
}

/**
 * Atomic Lua script for sliding-window rate limiting in Redis using a sorted set.
 * A unique member suffix avoids collisions between requests that arrive in the
 * same millisecond while keeping the whole admission decision atomic.
 */
const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local max = tonumber(ARGV[3])
local nonce = ARGV[4]
local clearBefore = now - window

redis.call('ZREMRANGEBYSCORE', key, 0, clearBefore)
local current = redis.call('ZCARD', key)

if current < max then
    redis.call('ZADD', key, now, now .. '-' .. nonce)
    redis.call('EXPIRE', key, math.ceil(window / 1000) + 1)
    local remaining = max - current - 1
    return {1, remaining, math.ceil(window / 1000)}
else
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local resetMs = tonumber(oldest[2]) + window - now
    local retryAfter = math.ceil(resetMs / 1000)
    if retryAfter < 1 then retryAfter = 1 end
    return {0, 0, retryAfter}
end
`;

export function rateLimit(options: RateLimitOptions): RateLimiter {
  const { max, windowMs, prefix, failureMode = "memory" } = options;

  async function evaluate(identifier: string): Promise<RateLimitResult> {
    const key = `ratelimit:${prefix}:user:${identifier}`;
    const now = Date.now();
    const redis = options.redisClient ?? getRedisClient();

    try {
      const nonce = randomUUID();

      const result = (await redis.eval(
        SLIDING_WINDOW_LUA,
        1,
        key,
        now.toString(),
        windowMs.toString(),
        max.toString(),
        nonce,
      )) as [number, number, number];

      const [allowedNum, remaining, resetSeconds] = result;
      return {
        allowed: allowedNum === 1,
        limit: max,
        remaining: Math.max(0, remaining),
        resetSeconds: Math.max(1, resetSeconds),
      };
    } catch {
      if (failureMode === "closed") {
        return {
          allowed: false,
          limit: max,
          remaining: 0,
          resetSeconds: 1,
          unavailable: true,
        };
      }

      maybeCleanMemoryStore(now);
      const existingEntry = memoryFallbackStore.get(key);
      const entry =
        existingEntry?.windowMs === windowMs
          ? existingEntry
          : { timestamps: [], windowMs, expiresAt: now + windowMs };
      entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

      if (entry.timestamps.length < max) {
        entry.timestamps.push(now);
        entry.expiresAt = now + windowMs;
        memoryFallbackStore.set(key, entry);
        return {
          allowed: true,
          limit: max,
          remaining: max - entry.timestamps.length,
          resetSeconds: Math.ceil(windowMs / 1000),
        };
      }

      const oldest = entry.timestamps[0] ?? now;
      const retryAfter = Math.max(
        1,
        Math.ceil((oldest + windowMs - now) / 1000),
      );
      return {
        allowed: false,
        limit: max,
        remaining: 0,
        resetSeconds: retryAfter,
      };
    }
  }

  return {
    evaluate,
    async check(identifier: string): Promise<NextResponse | null> {
      const result = await evaluate(identifier);
      if (result.allowed) {
        return null;
      }

      if (result.unavailable) {
        return NextResponse.json(
          { error: "Service temporarily unavailable. Please try again." },
          {
            status: 503,
            headers: {
              "Retry-After": String(result.resetSeconds),
              "Cache-Control": "no-store",
            },
          },
        );
      }

      const retryAfter = result.resetSeconds;
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            "RateLimit-Limit": String(max),
            "RateLimit-Remaining": "0",
            "RateLimit-Reset": String(retryAfter),
            "X-RateLimit-Limit": String(max),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(retryAfter),
          },
        },
      );
    },
  };
}
