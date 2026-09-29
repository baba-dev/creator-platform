import Redis from "ioredis";

declare global {
  var __aiwa_web_redis__: Redis | undefined;
}

/**
 * Returns one shared Redis client per web runtime/process.
 *
 * Caching in production is essential: creating an ioredis client for every
 * request would create unbounded connection churn and can exhaust Redis
 * maxclients/file descriptors under load. The global also survives Next.js
 * development hot reloads.
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
    // Avoid crashing on transient connection drops. Rate-limit callers decide
    // whether a Redis outage should fail closed or use the memory fallback.
    if (process.env.NODE_ENV !== "test") {
      console.error("[redis] Connection warning:", err?.message || err);
    }
  });

  globalThis.__aiwa_web_redis__ = client;
  return client;
}
