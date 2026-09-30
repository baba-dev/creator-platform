import type { Job } from "bullmq";

export const assetJobOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 30_000 },
  removeOnComplete: true,
  // Count-based eviction would reset the retry budget when the DB scanner runs.
  removeOnFail: false,
} as const;

/** Apply retention to backlog jobs created by releases with eviction enabled. */
export function retainFailedAssetJob(job: Pick<Job, "opts">): void {
  job.opts.removeOnFail = false;
}
