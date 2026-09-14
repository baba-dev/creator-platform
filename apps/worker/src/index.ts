import { parseServerEnv } from "@aiwa/config";
import { Worker } from "bullmq";
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

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  log("info", "worker shutting down", { signal });
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
