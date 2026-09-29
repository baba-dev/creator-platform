import Redis from "ioredis";

declare global {
  var __aiwa_web_redis__: Redis | undefined;
}

/**
 * Returns a shared, singleton Redis client for apps/web.
 * Reuses instance on globalThis across serverless invocations and hot reloads.
 */
export function getRedisClient(): Redis {
  if (globalThis.__aiwa_web_redis__) {
    return globalThis.__aiwa_web_redis__;
  }

  const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379/0";
  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 100, 1000);
    },
  });

  client.on("error", (err) => {
    // Avoid crashing on transient connection drops
    if (process.env.NODE_ENV !== "test") {
      console.error("[redis] Connection warning:", err?.message || err);
    }
  });

  if (process.env.NODE_ENV !== "production") {
    globalThis.__aiwa_web_redis__ = client;
  }

  return client;
}
