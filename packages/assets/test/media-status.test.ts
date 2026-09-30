import { describe, expect, it } from "vitest";
import { assetPreviewStatuses, previewMessage } from "../src/media-status";
import { mediaAlerts } from "../src/worker-health";
const asset = {
  mediaKind: "VIDEO",
  status: "READY",
  storageProvider: "LOCAL",
  variants: [{ kind: "POSTER" }],
};
const task = {
  id: "task",
  kind: "STORYBOARD",
  status: "FAILED",
  cycle: 1,
  attemptCount: 3,
  maxAttempts: 3,
  nextAttemptAt: null,
};
describe("optional preview states", () => {
  it("keeps a published poster ready when the storyboard exhausts retries", () => {
    const statuses = assetPreviewStatuses(asset, [task]);
    expect(statuses.map((preview) => preview.state)).toEqual([
      "READY",
      "FAILED",
    ]);
    expect(statuses[1]?.canRetry).toBe(true);
    expect(asset.status).toBe("READY");
  });
  it("never offers retries for review, deleted sources or exhausted manual cycles", () => {
    for (const state of ["REVIEW", "PROCESSING", "RETRY_WAIT", "PENDING"])
      expect(
        assetPreviewStatuses(asset, [{ ...task, status: state }])[1]?.canRetry,
      ).toBe(false);
    expect(
      assetPreviewStatuses(asset, [{ ...task, cycle: 3 }])[1]?.canRetry,
    ).toBe(false);
    expect(
      assetPreviewStatuses({ ...asset, status: "DELETED" }, [task])[1]?.state,
    ).toBe("UNAVAILABLE");
  });
  it("does not show perpetual processing after a completed task loses its variant", () => {
    expect(
      assetPreviewStatuses(asset, [{ ...task, status: "SUCCEEDED" }])[1]?.state,
    ).toBe("UNAVAILABLE");
    expect(previewMessage("FAILED")).not.toContain("Preparing");
    expect(
      assetPreviewStatuses({ ...asset, storageProvider: "S3" }, [task])[1]
        ?.state,
    ).toBe("UNAVAILABLE");
  });
  it("returns no preview work for documents", () => {
    expect(
      assetPreviewStatuses({ ...asset, mediaKind: "DOCUMENT" }, []),
    ).toEqual([]);
  });
});
describe("actionable media diagnostics", () => {
  it("distinguishes unknown telemetry, review and expired capacity", () => {
    const alerts = mediaAlerts({
      oldestQueueAgeSeconds: 601,
      reviewCount: 1,
      failedCount: 2,
      capacityExpired: true,
      workers: [],
      telemetryAvailable: false,
    });
    expect(alerts.map((alert) => alert.code)).toEqual(
      expect.arrayContaining([
        "TELEMETRY_UNAVAILABLE",
        "TASK_REVIEW",
        "CAPACITY_EXPIRED",
        "MEDIA_BACKLOG",
      ]),
    );
    expect(alerts.every((alert) => alert.action.length > 10)).toBe(true);
    expect(alerts.some((alert) => alert.code === "MEDIA_WORKER_MISSING")).toBe(
      false,
    );
  });
  it("deduplicates shared host alerts across worker roles", () => {
    const worker = {
      instanceId: "11111111-1111-4111-8111-111111111111",
      role: "media" as const,
      sampledAt: new Date().toISOString(),
      rssBytes: 1,
      eventLoopP99Ms: 300,
      eventLoopMaxMs: 400,
      stalledSinceStart: 1,
      mediaEnabled: true,
      host: {
        availableMemoryPercent: 10,
        cpuStealPercent: 90,
        cpuPressureAvg10: 50,
        memoryPressureAvg10: 0,
        ioPressureAvg10: 0,
      },
    };
    const alerts = mediaAlerts({
      oldestQueueAgeSeconds: 0,
      reviewCount: 0,
      failedCount: 0,
      capacityExpired: false,
      workers: [worker, worker],
      telemetryAvailable: true,
    });
    expect(alerts.filter((alert) => alert.code === "CPU_STEAL")).toHaveLength(
      1,
    );
    expect(alerts.map((alert) => alert.code)).toEqual(
      expect.arrayContaining([
        "EVENT_LOOP_DELAY",
        "MEMORY_PRESSURE",
        "QUEUE_LOCK_LOST",
      ]),
    );
  });
});
