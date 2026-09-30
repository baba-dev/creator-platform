import Redis from "ioredis";
declare global {
  var __aiwa_media_telemetry_redis__: Redis | undefined;
}
export function getMediaTelemetryRedis() {
  if (!globalThis.__aiwa_media_telemetry_redis__) {
    const redis = new Redis(
      process.env.REDIS_URL ?? "redis://127.0.0.1:6379/0",
      {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 1500,
        commandTimeout: 1500,
        retryStrategy: (times) => (times <= 2 ? 100 : null),
      },
    );
    redis.on("error", () => {});
    globalThis.__aiwa_media_telemetry_redis__ = redis;
  }
  return globalThis.__aiwa_media_telemetry_redis__;
}
