import { parseServerEnv } from "@aiwa/config";
import { db } from "@aiwa/db";
import { processImageJob } from "@aiwa/generation/process";
import { createBytePlusProvider } from "@aiwa/providers/byteplus";
import { createNvidiaProvider } from "@aiwa/providers/nvidia";
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { processReasoningJob } from "./reasoning";

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

  if (level === "error") console.error(entry);
  else console.info(entry);
}

const maintenanceWorker = new Worker(
  "maintenance",
  async (job) => {
    log("info", "maintenance job received", {
      jobId: job.id,
      jobName: job.name,
    });
    return { processedAt: new Date().toISOString() };
  },
  { connection: redis, concurrency: 1, prefix: "aiwa" },
);

maintenanceWorker.on("completed", (job) => {
  log("info", "job completed", { jobId: job.id, queue: job.queueName });
});
maintenanceWorker.on("failed", (job, error) => {
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
const bytePlusProvider = env.BYTEPLUS_API_KEY
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
    if (!bytePlusProvider)
      throw new Error("Generation provider is not configured");
    if (typeof job.data.jobId !== "string" || job.data.jobId !== job.id)
      throw new Error("Invalid generation queue payload");
    await processImageJob(job.data.jobId, bytePlusProvider);
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

const reasoningQueue = new Queue("reasoning", {
  connection: redis,
  prefix: "aiwa",
});
const nvidiaProvider = env.NVIDIA_API_KEY
  ? createNvidiaProvider({
      apiKey: env.NVIDIA_API_KEY,
      baseUrl: env.NVIDIA_BASE_URL,
      defaultModel:
        env.NVIDIA_REASONING_MODEL ||
        "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
      requestTimeoutMs: env.NVIDIA_REQUEST_TIMEOUT_MS,
    })
  : null;

const reasoningWorker = new Worker(
  "reasoning",
  async (job) => {
    if (!nvidiaProvider)
      throw new Error("Reasoning provider is not configured");
    await processReasoningJob(job, nvidiaProvider);
  },
  { connection: redis, prefix: "aiwa", concurrency: 2 },
);

reasoningWorker.on("error", () =>
  log("error", "Reasoning queue connection failed"),
);
reasoningWorker.on("failed", (job, error) =>
  log("error", "Reasoning job failed", {
    jobId: job?.id,
    attemptsMade: job?.attemptsMade,
    errorName: error.name,
    errorMessage: error.message,
  }),
);

let generationDispatching = false;
async function dispatchGeneration() {
  if (generationDispatching || !bytePlusProvider) return;
  generationDispatching = true;
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
          backoff: { type: "exponential", delay: 10_000 },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
    }
  } catch (error) {
    log("error", "Generation dispatch unavailable; database jobs retained", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  } finally {
    generationDispatching = false;
  }
}

let reasoningDispatching = false;
async function dispatchReasoning() {
  if (reasoningDispatching || !nvidiaProvider) return;
  reasoningDispatching = true;
  try {
    // A PROCESSING row left behind by a worker crash has an unknown provider
    // outcome. Never replay it automatically because the hosted API has no
    // request-status reconciliation endpoint.
    await db.reasoningJob.updateMany({
      where: {
        status: "PROCESSING",
        updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
      },
      data: {
        status: "FAILED",
        errorCode: "WORKER_INTERRUPTED",
        errorMessage:
          "Prompt enhancement was interrupted. Retry from Studio if needed.",
        completedAt: new Date(),
      },
    });

    const jobs = await db.reasoningJob.findMany({
      where: { status: "QUEUED" },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: 100,
    });

    for (const job of jobs) {
      const queued = await reasoningQueue.getJob(job.id);
      if (queued) {
        const state = await queued.getState();
        if (["failed", "completed"].includes(state)) await queued.remove();
        else continue;
      }

      await reasoningQueue.add(
        "prompt-enhancement",
        { jobId: job.id },
        {
          jobId: job.id,
          attempts: 2,
          backoff: { type: "exponential", delay: 2_000 },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
    }
  } catch (error) {
    log("error", "Reasoning dispatch unavailable; database jobs retained", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  } finally {
    reasoningDispatching = false;
  }
}

const generationDispatchTimer = setInterval(
  () => void dispatchGeneration(),
  10_000,
);
const reasoningDispatchTimer = setInterval(
  () => void dispatchReasoning(),
  2_000,
);
void dispatchGeneration();
void dispatchReasoning();

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  log("info", "worker shutting down", { signal });
  clearInterval(generationDispatchTimer);
  clearInterval(reasoningDispatchTimer);
  await Promise.all([
    generationWorker.close(),
    reasoningWorker.close(),
    generationQueue.close(),
    reasoningQueue.close(),
  ]);
  await db.$disconnect();
  await maintenanceWorker.close();
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
  queues: ["maintenance", "generation", "reasoning"],
  environment: env.APP_ENV,
  bytePlusConfigured: Boolean(bytePlusProvider),
  nvidiaConfigured: Boolean(nvidiaProvider),
});
