import { mediaDiagnostics } from "@aiwa/assets/media-diagnostics";
import {
  mediaAlerts,
  workerHealthSchema,
  type WorkerHealth,
} from "@aiwa/assets/worker-health";
import { getMediaTelemetryRedis } from "./media-telemetry-redis";
async function readWorkerHealthInner() {
  try {
    const redis = getMediaTelemetryRedis();
    let cursor = "0";
    const keys = new Set<string>();
    for (let page = 0; page < 5; page++) {
      const result = await redis.scan(
        cursor,
        "MATCH",
        "aiwa:worker-health:*",
        "COUNT",
        200,
      );
      cursor = result[0];
      result[1].forEach((key) => keys.add(key));
      if (cursor === "0" || keys.size >= 100) break;
    }
    const workers: WorkerHealth[] = [];
    if (keys.size) {
      for (const value of await redis.mget(...[...keys].slice(0, 100))) {
        if (!value || value.length > 4096) continue;
        let decoded: unknown;
        try {
          decoded = JSON.parse(value);
        } catch {
          continue;
        }
        const parsed = workerHealthSchema.safeParse(decoded);
        if (
          parsed.success &&
          Date.now() - Date.parse(parsed.data.sampledAt) <= 90_000 &&
          Date.parse(parsed.data.sampledAt) <= Date.now() + 5000
        )
          workers.push(parsed.data);
      }
    }
    return { workers, telemetryAvailable: true };
  } catch {
    return { workers: [], telemetryAvailable: false };
  }
}
export async function mediaOperationsSnapshot() {
  const [diagnostics, health] = await Promise.all([
    mediaDiagnostics(),
    readWorkerHealth(),
  ]);
  return {
    ...diagnostics,
    ...health,
    alerts: mediaAlerts({
      ...health,
      oldestQueueAgeSeconds: diagnostics.oldestQueueAgeSeconds,
      reviewCount: diagnostics.counts.REVIEW ?? 0,
      failedCount: diagnostics.counts.FAILED ?? 0,
      capacityExpired: diagnostics.capacity.expired,
    }),
  };
}

export async function readWorkerHealth() {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      readWorkerHealthInner(),
      new Promise<{ workers: WorkerHealth[]; telemetryAvailable: boolean }>(
        (resolve) => {
          timeout = setTimeout(
            () => resolve({ workers: [], telemetryAvailable: false }),
            5000,
          );
        },
      ),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
