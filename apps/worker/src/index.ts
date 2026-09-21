import { parseServerEnv } from "@aiwa/config";
import { db } from "@aiwa/db";
import { processImageJob } from "@aiwa/generation/process";
import { createBytePlusProvider } from "@aiwa/providers/byteplus";
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";

const env = parseServerEnv();
const redis = new Redis(env.REDIS_URL, {
  enableReadyCheck: true,
  maxRetriesPerRequest: null,
});

function log(
  level: "info" | "error",
  message: string,
  fields: Readonly<Record<string, unknown>> = {},
): void {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: "creator-platform-worker",
    version: env.APP_VERSION,
    message,
    ...fields,
  });

  if (level === "error") {
    console.error(entry);
  } else {
    console.info(entry);
  }
}

const worker = new Worker(
  "maintenance",
  async (job) => {
    log("info", "maintenance job received", {
      jobId: job.id,
      jobName: job.name,
    });

    return { processedAt: new Date().toISOString() };
  },
  {
    connection: redis,
    concurrency: 1,
    prefix: "aiwa",
  },
);

worker.on("completed", (job) => {
  log("info", "job completed", { jobId: job.id, queue: job.queueName });
});

worker.on("failed", (job, error) => {
  log("error", "job failed", {
    jobId: job?.id,
    queue: job?.queueName,
    errorName: error.name,
  });
});

const generationQueue = new Queue("generation", {
  connection: redis,
  prefix: "aiwa",
});
const provider = env.BYTEPLUS_API_KEY
  ? createBytePlusProvider({
      apiKey: env.BYTEPLUS_API_KEY,
      region: env.BYTEPLUS_REGION,
      modelArkBaseUrl: env.BYTEPLUS_MODELARK_BASE_URL,
      requestTimeoutMs: env.BYTEPLUS_REQUEST_TIMEOUT_MS,
    })
  : null;
const generationWorker = new Worker(
  "generation",
  async (job) => {
    if (!provider) throw new Error("Generation provider is not configured");
    if (typeof job.data.jobId !== "string" || job.data.jobId !== job.id)
      throw new Error("Invalid generation queue payload");
    await processImageJob(job.data.jobId, provider);
  },
  { connection: redis, prefix: "aiwa", concurrency: 1 },
);
generationWorker.on("error", () =>
  log("error", "Generation queue connection failed"),
);
generationWorker.on("failed", (job, error) =>
  log("error", "Generation processing failed; recovery remains queued", {
    jobId: job?.id,
    attemptsMade: job?.attemptsMade,
    errorName: error.name,
    errorMessage: error.message,
  }),
);
let dispatching = false;
async function dispatch() {
  if (dispatching || !provider) return;
  dispatching = true;
  try {
    // Lost responses cannot safely be replayed for synchronous image generation.
    await db.generationJob.updateMany({
      where: {
        status: "SUBMITTED",
        submittedAt: { lt: new Date(Date.now() - 15 * 60 * 1000) },
      },
      data: {
        status: "MANUAL_REVIEW",
        errorCode: "WORKER_INTERRUPTED",
        errorMessage:
          "Submission was interrupted. Credits remain reserved for review.",
      },
    });
    await db.generationJob.updateMany({
      where: {
        status: "PROCESSING",
        OR: [
          {
            submittedAt: {
              lt: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
          },
          {
            submittedAt: null,
            updatedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        ],
      },
      data: {
        status: "MANUAL_REVIEW",
        errorCode: "STORAGE_FAILED",
        errorMessage:
          "Image could not be stored. Credits remain reserved for review.",
      },
    });
    const retryBefore = new Date(Date.now() - 60 * 1000);
    const jobs = await db.generationJob.findMany({
      where: {
        OR: [
          { status: "QUEUED" },
          {
            status: "PROCESSING",
            OR: [
              { errorCode: null },
              { errorCode: { not: null }, updatedAt: { lt: retryBefore } },
            ],
          },
        ],
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    for (const job of jobs) {
      const queued = await generationQueue.getJob(job.id);
      if (queued && ["failed", "completed"].includes(await queued.getState()))
        await queued.remove();
      await generationQueue.add(
        "image",
        { jobId: job.id },
        {
          jobId: job.id,
          attempts: 3,
          backoff: { type: "exponential", delay: 10000 },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
    }
  } catch {
    log("error", "Generation dispatch unavailable; database jobs retained");
  } finally {
    dispatching = false;
  }
}
const dispatchTimer = setInterval(() => void dispatch(), 10000);
void dispatch();

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  log("info", "worker shutting down", { signal });
  clearInterval(dispatchTimer);
  await generationWorker.close();
  await generationQueue.close();
  await db.$disconnect();
  await worker.close();
  await redis.quit();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal)
      .catch((error: unknown) => {
        log("error", "worker shutdown failed", {
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
        process.exitCode = 1;
      })
      .finally(() => process.exit());
  });
}

log("info", "worker started", {
  queue: "maintenance",
  environment: env.APP_ENV,
});
