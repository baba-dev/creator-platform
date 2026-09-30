import { beforeEach, expect, it, vi } from "vitest";
const redis = vi.hoisted(() => ({ scan: vi.fn(), mget: vi.fn() }));
vi.mock("./media-telemetry-redis", () => ({
  getMediaTelemetryRedis: () => redis,
}));
vi.mock("@aiwa/assets/media-diagnostics", () => ({
  mediaDiagnostics: vi.fn(),
}));
import { readWorkerHealth } from "./media-operations";
beforeEach(() => vi.resetAllMocks());
it("ignores malformed and stale heartbeat records while retaining fresh roles", async () => {
  const record = {
    instanceId: "11111111-1111-4111-8111-111111111111",
    role: "media",
    sampledAt: new Date().toISOString(),
    rssBytes: 10,
    eventLoopP99Ms: 20,
    eventLoopMaxMs: 30,
    stalledSinceStart: 0,
    mediaEnabled: true,
    host: {
      availableMemoryPercent: null,
      cpuStealPercent: null,
      cpuPressureAvg10: null,
      memoryPressureAvg10: null,
      ioPressureAvg10: null,
    },
  };
  redis.scan.mockResolvedValue(["0", ["a", "b", "c"]]);
  redis.mget.mockResolvedValue([
    "bad json",
    JSON.stringify(record),
    JSON.stringify({
      ...record,
      sampledAt: new Date(Date.now() - 100_000).toISOString(),
    }),
  ]);
  const result = await readWorkerHealth();
  expect(result.telemetryAvailable).toBe(true);
  expect(result.workers).toEqual([record]);
});
it("bounds SCAN work and degrades safely when Redis is unavailable", async () => {
  redis.scan.mockResolvedValue(["1", []]);
  expect((await readWorkerHealth()).telemetryAvailable).toBe(true);
  expect(redis.scan).toHaveBeenCalledTimes(5);
  redis.scan.mockRejectedValue(new Error("Connection unavailable"));
  expect(await readWorkerHealth()).toEqual({
    workers: [],
    telemetryAvailable: false,
  });
});
