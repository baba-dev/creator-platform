import { z } from "zod";
export const workerHealthSchema = z.object({
  instanceId: z.uuid(),
  role: z.enum(["all", "core", "orchestration", "mail", "media"]),
  sampledAt: z.iso.datetime(),
  rssBytes: z.number().nonnegative(),
  eventLoopP99Ms: z.number().nonnegative(),
  eventLoopMaxMs: z.number().nonnegative(),
  stalledSinceStart: z.number().int().nonnegative(),
  mediaEnabled: z.boolean(),
  host: z.object({
    availableMemoryPercent: z.number().min(0).max(100).nullable(),
    cpuStealPercent: z.number().min(0).max(100).nullable(),
    cpuPressureAvg10: z.number().min(0).max(100).nullable(),
    memoryPressureAvg10: z.number().min(0).max(100).nullable(),
    ioPressureAvg10: z.number().min(0).max(100).nullable(),
  }),
});
export type WorkerHealth = z.infer<typeof workerHealthSchema>;
export type MediaAlert = { code: string; message: string; action: string };
export function mediaAlerts(input: {
  oldestQueueAgeSeconds: number;
  reviewCount: number;
  failedCount: number;
  capacityExpired: boolean;
  workers: WorkerHealth[];
  telemetryAvailable: boolean;
}): MediaAlert[] {
  const alerts: MediaAlert[] = [];
  const add = (code: string, message: string, action: string) => {
    if (!alerts.some((alert) => alert.code === code))
      alerts.push({ code, message, action });
  };
  if (!input.telemetryAvailable)
    add(
      "TELEMETRY_UNAVAILABLE",
      "Worker telemetry is unavailable.",
      "Check Redis connectivity. Database task history remains available.",
    );
  else if (
    !input.workers.some((worker) => ["all", "media"].includes(worker.role))
  )
    add(
      "MEDIA_WORKER_MISSING",
      "No fresh media-worker heartbeat.",
      "Check the selected service, deployment version and worker logs.",
    );
  if (
    input.workers.some(
      (worker) =>
        ["all", "media"].includes(worker.role) && !worker.mediaEnabled,
    )
  )
    add(
      "MEDIA_PAUSED",
      "Media processing is paused by configuration.",
      "Review MEDIA_PROCESSING_ENABLED on the media service before resuming.",
    );
  if (input.capacityExpired)
    add(
      "CAPACITY_EXPIRED",
      "Native media capacity has expired ownership.",
      "Stop and confirm all old native processes, then use audited creator-ops recovery.",
    );
  if (input.reviewCount)
    add(
      "TASK_REVIEW",
      `${input.reviewCount} tasks need ownership review.`,
      "Inspect task history. Use confirmed-stopped recovery; never blindly retry.",
    );
  if (input.failedCount)
    add(
      "TASK_FAILED",
      `${input.failedCount} media tasks have failed.`,
      "Inspect error codes and attempt history; retry eligible previews or recreate failed edits/exports.",
    );
  if (input.oldestQueueAgeSeconds > 600)
    add(
      "MEDIA_BACKLOG",
      "A queued media task has waited over 10 minutes.",
      "Check pause state, native capacity, resource pressure and recent completions.",
    );
  for (const worker of input.workers) {
    if (worker.eventLoopP99Ms > 250)
      add(
        "EVENT_LOOP_DELAY",
        "Worker event-loop p99 exceeds 250 ms.",
        "Inspect CPU pressure and isolate or resize the affected service.",
      );
    if (worker.stalledSinceStart > 0)
      add(
        "QUEUE_LOCK_LOST",
        "A worker has observed stalled queue locks since startup.",
        "Check role-tagged stalled-job logs and CPU starvation before increasing concurrency.",
      );
    if (
      worker.host.availableMemoryPercent !== null &&
      worker.host.availableMemoryPercent < 15
    )
      add(
        "MEMORY_PRESSURE",
        "Host available memory is below 15%.",
        "Pause media and check swap/RSS before enabling more worker processes.",
      );
    if ((worker.host.cpuStealPercent ?? 0) > 20)
      add(
        "CPU_STEAL",
        "Host CPU steal exceeds 20%.",
        "Check VPS CPU entitlement and provider contention; more FFmpeg threads will not solve it.",
      );
    if (
      (worker.host.cpuPressureAvg10 ?? 0) > 40 ||
      (worker.host.memoryPressureAvg10 ?? 0) > 10 ||
      (worker.host.ioPressureAvg10 ?? 0) > 20
    )
      add(
        "HOST_STALLS",
        "Host resource stalls exceed the diagnostic threshold.",
        "Inspect CPU, memory and I/O pressure before resuming media load.",
      );
  }
  return alerts;
}
