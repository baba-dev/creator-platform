import { randomUUID } from "node:crypto";
import { Queue, QueueEvents, Worker, type Job } from "bullmq";
import Redis from "ioredis";
import { describe, expect, it } from "vitest";
import {
  assetJobOptions,
  canDispatchAssetJob,
  retryFailedDerivative,
  retainFailedAssetJob,
} from "../src/asset-dispatch";

describe.skipIf(process.env.GENERATION_INTEGRATION_TEST !== "true")(
  "media queue containment with Redis",
  () => {
    it("enforces capacity across workers, retains exhausted failures and resumes paused work", async () => {
      const redis = new Redis(
        process.env.REDIS_URL ?? "redis://127.0.0.1:6379/0",
        { maxRetriesPerRequest: null },
      );
      const options = {
        connection: redis,
        prefix: `containment-${randomUUID()}`,
      };
      const queue = new Queue("media", options);
      const events = new QueueEvents("media", options);
      let active = 0;
      let maximum = 0;
      let failedAttempts = 0;
      const processJob = async (job: Job) => {
        retainFailedAssetJob(job);
        active++;
        maximum = Math.max(maximum, active);
        try {
          await new Promise((resolve) => setTimeout(resolve, 20));
          if (job.name === "derive") {
            failedAttempts++;
            throw new Error("invalid media");
          }
          return "done";
        } finally {
          active--;
        }
      };
      const workers: Worker[] = [];
      try {
        await queue.setGlobalConcurrency(1);
        await queue.pause();
        await events.waitUntilReady();
        workers.push(
          new Worker("media", processJob, { ...options, concurrency: 3 }),
          new Worker("media", processJob, { ...options, concurrency: 3 }),
        );
        const jobs = await Promise.all(
          [0, 1, 2].map((id) =>
            queue.add("valid", {}, { jobId: `valid-${id}` }),
          ),
        );
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(active).toBe(0);
        const completed = jobs.map((job) =>
          job.waitUntilFinished(events, 5000),
        );
        await queue.resume();
        await Promise.all(completed);
        expect(maximum).toBe(1);
        const broken = await queue.add(
          "derive",
          { assetId: "broken" },
          {
            ...assetJobOptions,
            jobId: "broken",
            removeOnFail: 1,
            backoff: { type: "fixed", delay: 5 },
          },
        );
        await expect(broken.waitUntilFinished(events, 5000)).rejects.toThrow(
          "invalid media",
        );
        for (let scan = 0; scan < 3; scan++)
          expect(await canDispatchAssetJob(queue, "broken")).toBe(false);
        expect(failedAttempts).toBe(3);
        const otherFailure = await queue.add(
          "derive",
          { assetId: "other" },
          { ...assetJobOptions, jobId: "other", attempts: 1, removeOnFail: 1 },
        );
        await expect(
          otherFailure.waitUntilFinished(events, 5000),
        ).rejects.toThrow("invalid media");
        expect(await queue.getJob("broken")).toBeDefined();
        let auditedAttempts = 0;
        await retryFailedDerivative(queue, "broken", async (attempts) => {
          auditedAttempts = attempts;
        });
        await expect(
          (await queue.getJob("broken"))!.waitUntilFinished(events, 5000),
        ).rejects.toThrow("invalid media");
        expect(auditedAttempts).toBe(3);
        expect(failedAttempts).toBe(7);
        expect(await (await queue.getJob("broken"))!.getState()).toBe("failed");
      } finally {
        await Promise.all(workers.map((worker) => worker.close()));
        await events.close();
        await queue.obliterate({ force: true });
        await queue.close();
        await redis.quit();
      }
    }, 15000);
  },
);
