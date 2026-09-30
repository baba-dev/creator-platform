import type { Job, Queue } from "bullmq";

/** Keep exhausted jobs as tombstones. Only completed work may be redispatched. */
export async function canDispatchAssetJob(
  queue: Queue,
  id: string,
  onFailed?: () => Promise<void>,
): Promise<boolean> {
  const job = await queue.getJob(id);
  if (!job) return true;
  const state = await job.getState();
  if (state === "failed") {
    await onFailed?.();
    return false;
  }
  if (state !== "completed") return false;
  await job.remove();
  return true;
}

export const assetJobOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 30_000 },
  removeOnComplete: true,
  // Count-based eviction would reset the retry budget when the DB scanner runs.
  removeOnFail: false,
} as const;

/** Explicit operator recovery; automatic scanners must never call this. */
export async function retryFailedDerivative(
  queue: Queue,
  assetId: string,
  audit: (attemptsMade: number) => Promise<void>,
): Promise<void> {
  const job = await queue.getJob(assetId);
  if (
    !job ||
    job.name !== "derive" ||
    job.data.assetId !== assetId ||
    (await job.getState()) !== "failed"
  )
    throw new Error("Only an exhausted derivative task can be retried");
  await audit(job.attemptsMade);
  await job.retry("failed", {
    resetAttemptsMade: true,
    resetAttemptsStarted: true,
  });
}

/** Apply retention to backlog jobs created by releases with eviction enabled. */
export function retainFailedAssetJob(job: Pick<Job, "opts">): void {
  job.opts.removeOnFail = false;
}
