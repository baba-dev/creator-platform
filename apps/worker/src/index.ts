import {
  withMediaCapacity,
  configureMediaCapacityGate,
} from "@aiwa/assets/media-capacity";
import sharp from "sharp";
import {
  withDatabaseMediaCapacity,
  runMediaTask,
  ensureMediaTask,
  reviewExpiredMediaTasks,
} from "./media-tasks";
import { assetJobOptions, retainFailedAssetJob } from "./asset-dispatch";
import { parseServerEnv } from "@aiwa/config";
import { db } from "@aiwa/db";
import {
  processImageJob,
  processVideoPollJob,
  processVideoSubmitJob,
  processVoiceJob,
} from "@aiwa/generation/process";
import { mailJobId } from "@aiwa/mail";
import {
  closeSmtpTransport,
  processMailMessage,
  recoverStaleMailDeliveries,
} from "@aiwa/mail/transport";
import { createBytePlusProvider } from "@aiwa/providers/byteplus";
import { createNvidiaProvider } from "@aiwa/providers/nvidia";
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import {
  processAssetDerivatives,
  purgeExpiredAssets,
  purgeMediaAttemptOutputs,
} from "./assets";
import { failImageOperation, processImageOperation } from "./image-operations";
import { failVideoRender, processVideoRender } from "./video-renders";
import { processReasoningJob } from "./reasoning";
import { reapExpiredRecoveryJobs } from "./reaper";

configureMediaCapacityGate(withDatabaseMediaCapacity);
const env = parseServerEnv();
sharp.concurrency(env.MEDIA_THREADS);
sharp.cache({ memory: 32, files: 0, items: 32 });
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

const mailQueue = new Queue("mail", {
  connection: redis,
  prefix: "aiwa",
});

const mailWorker = new Worker(
  "mail",
  async (job) => {
    if (!env.MAIL_ENABLED) return;
    if (
      typeof job.data.mailId !== "string" ||
      typeof job.data.attemptNumber !== "number"
    ) {
      throw new Error("Invalid mail queue payload");
    }
    await processMailMessage(env, job.data.mailId, job.data.attemptNumber, 5);
  },
  { connection: redis, prefix: "aiwa", concurrency: 3 },
);

mailWorker.on("error", () => log("error", "Mail queue connection failed"));
mailWorker.on("failed", (job, error) =>
  log("error", "Mail delivery attempt failed", {
    mailId: job?.data?.mailId,
    attemptsMade: job?.attemptsMade,
    errorName: error.name,
    errorMessage: error.message,
  }),
);

const generationQueue = new Queue("generation", {
  connection: redis,
  prefix: "aiwa",
});
const hasBytePlus = Boolean(
  env.BYTEPLUS_API_KEY || env.BYTEPLUS_SPEECH_API_KEY,
);
const bytePlusProvider = hasBytePlus
  ? createBytePlusProvider({
      apiKey: env.BYTEPLUS_API_KEY,
      region: env.BYTEPLUS_REGION,
      modelArkBaseUrl: env.BYTEPLUS_MODELARK_BASE_URL,
      speechBaseUrl: env.BYTEPLUS_SPEECH_BASE_URL,
      speechApiKey: env.BYTEPLUS_SPEECH_API_KEY,
      speechAppKey: env.BYTEPLUS_SPEECH_APP_KEY,
      requestTimeoutMs: env.BYTEPLUS_REQUEST_TIMEOUT_MS,
      idleTimeoutMs: env.BYTEPLUS_IDLE_TIMEOUT_MS,
    })
  : null;

const generationWorker = new Worker(
  "generation",
  async (job) => {
    if (!bytePlusProvider)
      throw new Error("Generation provider is not configured");
    if (typeof job.data.jobId !== "string" || job.data.jobId !== job.id)
      throw new Error("Invalid generation queue payload");
    switch (job.name) {
      case "image":
        await processImageJob(job.data.jobId, bytePlusProvider);
        return;
      case "video-submit":
        await processVideoSubmitJob(job.data.jobId, bytePlusProvider);
        return;
      case "video-poll":
        await processVideoPollJob(job.data.jobId, bytePlusProvider);
        return;
      case "voice":
        await processVoiceJob(job.data.jobId, bytePlusProvider);
        return;
      default:
        throw new Error("Unknown generation queue job");
    }
  },
  {
    connection: redis,
    prefix: "aiwa",
    concurrency: env.GENERATION_WORKER_CONCURRENCY,
  },
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

const assetQueue = new Queue("asset-ingestion", {
  connection: redis,
  prefix: "aiwa",
});

const assetWorker = new Worker(
  "asset-ingestion",
  async (job) =>
    withMediaCapacity(async () => {
      retainFailedAssetJob(job);
      if (job.name === "media-task" && typeof job.data.taskId === "string") {
        const task = await db.mediaTask.findUnique({
          where: { id: job.data.taskId },
        });
        if (!task) return;
        await runMediaTask(task.id, async () => {
          if (task.kind === "IMAGE_EDIT")
            await processImageOperation(task.targetId);
          else if (task.kind === "VIDEO_RENDER")
            await processVideoRender(task.targetId);
          else await processAssetDerivatives(task.targetId, task.kind);
        });
        return;
      }
      // Legacy delivery can precede discovery; import its previous attempts too.
      if (
        job.name === "image-edit" &&
        typeof job.data.operationId === "string"
      ) {
        const operation = await db.imageOperation.findUnique({
          where: { id: job.data.operationId },
        });
        if (!operation) return;
        const task = await ensureMediaTask({
          targetId: operation.id,
          organizationId: operation.organizationId,
          kind: "IMAGE_EDIT",
          legacyAttempts: job.attemptsMade,
        });
        await runMediaTask(task.id, () => processImageOperation(operation.id));
        return;
      }
      if (
        job.name === "video-render" &&
        typeof job.data.renderId === "string"
      ) {
        const render = await db.videoRender.findUnique({
          where: { id: job.data.renderId },
        });
        if (!render) return;
        const task = await ensureMediaTask({
          targetId: render.id,
          organizationId: render.organizationId,
          kind: "VIDEO_RENDER",
          legacyAttempts: job.attemptsMade,
        });
        await runMediaTask(task.id, () => processVideoRender(render.id));
        return;
      }
      if (job.name === "derive" && typeof job.data.assetId === "string") {
        const asset = await db.asset.findUnique({
          where: { id: job.data.assetId },
          include: { variants: true },
        });
        if (!asset) return;
        for (const kind of derivativeKinds(asset.mediaKind)) {
          if (asset.variants.some((variant) => variant.kind === kind)) continue;
          const task = await ensureMediaTask({
            targetId: asset.id,
            organizationId: asset.organizationId,
            kind,
            legacyAttempts: job.attemptsMade,
          });
          await runMediaTask(task.id, () =>
            processAssetDerivatives(asset.id, kind),
          );
        }
        return;
      }
      throw new Error("Invalid media queue payload");
    }),
  { connection: redis, prefix: "aiwa", concurrency: 1, autorun: false },
);

assetWorker.on("error", () =>
  log("error", "Asset ingestion queue connection failed"),
);
assetWorker.on("failed", (job) => {
  log("error", "Media delivery failed; durable state retained", {
    jobId: job?.id,
  });
});
function derivativeKinds(
  kind: string,
): ("THUMBNAIL" | "PREVIEW" | "POSTER" | "STORYBOARD" | "WAVEFORM")[] {
  return kind === "IMAGE"
    ? ["THUMBNAIL", "PREVIEW"]
    : kind === "VIDEO"
      ? ["POSTER", "STORYBOARD"]
      : kind === "AUDIO"
        ? ["WAVEFORM"]
        : [];
}
async function importTask(
  targetId: string,
  organizationId: string,
  kind: Parameters<typeof ensureMediaTask>[0]["kind"],
  legacyId: string,
) {
  const legacy = await assetQueue.getJob(legacyId);
  return ensureMediaTask({
    targetId,
    organizationId,
    kind,
    legacyAttempts: legacy?.attemptsMade,
    legacyFailed: legacy ? (await legacy.getState()) === "failed" : false,
  });
}

let mediaReady = false;
async function startMediaWorker(): Promise<void> {
  await assetQueue.setGlobalConcurrency(1);
  if (isShuttingDown) return;
  if (!env.MEDIA_PROCESSING_ENABLED) {
    await assetQueue.pause();
    log(
      "info",
      "Media processing paused; orchestration and mail remain enabled",
    );
    return;
  }
  await assetQueue.resume();
  mediaReady = true;
  void assetWorker.run().catch(() => {
    mediaReady = false;
    log("error", "Media worker stopped; queued tasks retained");
  });
}
void startMediaWorker().catch(() =>
  log("error", "Media worker startup failed; queued tasks retained"),
);

let operationScanCursor: string | undefined;
let renderScanCursor: string | undefined;
let cleanupScanCursor: string | undefined;
let assetScanCursor: string | undefined;
let assetDispatching = false;
async function dispatchAssets() {
  if (isShuttingDown || assetDispatching || !mediaReady) return;
  assetDispatching = true;
  try {
    await reviewExpiredMediaTasks();
    await purgeMediaAttemptOutputs();
    await purgeExpiredAssets();
    const operations = await db.imageOperation.findMany({
      where: {
        ...(operationScanCursor ? { id: { gt: operationScanCursor } } : {}),
        OR: [
          { status: "PENDING" },
          {
            status: "PROCESSING",
            processingAt: { lt: new Date(Date.now() - 5 * 60_000) },
          },
        ],
      },
      select: { id: true, organizationId: true },
      orderBy: { id: "asc" },
      take: 50,
    });
    operationScanCursor =
      operations.length === 50
        ? operations[operations.length - 1]!.id
        : undefined;
    for (const operation of operations)
      await importTask(
        operation.id,
        operation.organizationId,
        "IMAGE_EDIT",
        `image-edit-${operation.id}`,
      );
    const renders = await db.videoRender.findMany({
      where: {
        ...(renderScanCursor ? { id: { gt: renderScanCursor } } : {}),
        OR: [
          { status: "PENDING" },
          {
            status: "PROCESSING",
            processingAt: { lt: new Date(Date.now() - 6 * 60_000) },
          },
        ],
      },
      select: { id: true, organizationId: true },
      orderBy: { id: "asc" },
      take: 20,
    });
    renderScanCursor =
      renders.length === 20 ? renders[renders.length - 1]!.id : undefined;
    for (const render of renders)
      await importTask(
        render.id,
        render.organizationId,
        "VIDEO_RENDER",
        `video-render-${render.id}`,
      );
    const assets = await db.asset.findMany({
      where: {
        status: "READY",
        ...(assetScanCursor ? { id: { gt: assetScanCursor } } : {}),
        OR: [
          {
            mediaKind: "IMAGE",
            OR: [
              { variants: { none: { kind: "PREVIEW" } } },
              { variants: { none: { kind: "THUMBNAIL" } } },
            ],
          },
          {
            mediaKind: "VIDEO",
            OR: [
              { variants: { none: { kind: "POSTER" } } },
              { variants: { none: { kind: "STORYBOARD" } } },
            ],
          },
          { mediaKind: "AUDIO", variants: { none: { kind: "WAVEFORM" } } },
        ],
      },
      include: { variants: true },
      orderBy: { id: "asc" },
      take: 100,
    });
    assetScanCursor =
      assets.length === 100 ? assets[assets.length - 1]!.id : undefined;
    for (const asset of assets)
      for (const kind of derivativeKinds(asset.mediaKind)) {
        if (asset.variants.some((variant) => variant.kind === kind)) continue;
        await importTask(asset.id, asset.organizationId, kind, asset.id);
      }
    const tasks = await db.mediaTask.findMany({
      where: {
        status: { in: ["PENDING", "RETRY_WAIT"] },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: 100,
    });
    for (const task of tasks) {
      const jobId = `media-${task.id}-${task.cycle}-${task.attemptCount}`;
      const wakeup = await assetQueue.getJob(jobId);
      if (wakeup) {
        const state = await wakeup.getState();
        if (!["completed", "failed"].includes(state)) continue;
        await wakeup.remove();
      }
      await assetQueue.add(
        "media-task",
        { taskId: task.id },
        { ...assetJobOptions, jobId, attempts: 1 },
      );
    }
    const failed = await db.mediaTask.findMany({
      where: {
        status: "FAILED",
        kind: { in: ["IMAGE_EDIT", "VIDEO_RENDER"] },
        ...(cleanupScanCursor ? { id: { gt: cleanupScanCursor } } : {}),
      },
      orderBy: { id: "asc" },
      take: 100,
    });
    cleanupScanCursor =
      failed.length === 100 ? failed[failed.length - 1]!.id : undefined;
    for (const task of failed) {
      if (task.kind === "IMAGE_EDIT") await failImageOperation(task.targetId);
      else await failVideoRender(task.targetId);
    }
  } catch (error) {
    log("error", "Asset derivative dispatch unavailable", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  } finally {
    assetDispatching = false;
  }
}

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
      idleTimeoutMs: env.NVIDIA_IDLE_TIMEOUT_MS,
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

let isShuttingDown = false;
let mailDispatching = false;
async function dispatchMail() {
  if (isShuttingDown || mailDispatching || !env.MAIL_ENABLED) return;
  mailDispatching = true;
  try {
    const now = new Date();
    const recovered = await recoverStaleMailDeliveries(
      new Date(now.getTime() - 10 * 60 * 1000),
    );
    if (recovered > 0) {
      log("error", "Recovered stale interrupted mail deliveries", {
        recovered,
      });
    }

    const rows = await db.mailMessage.findMany({
      where: {
        OR: [
          { status: "PENDING" },
          { status: "QUEUED" },
          { status: "RETRY", nextAttemptAt: { lte: now } },
        ],
      },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      take: 100,
    });

    for (const row of rows) {
      if (isShuttingDown) break;
      const jobId = mailJobId(row.id);
      const existing = await mailQueue.getJob(jobId);
      if (existing) {
        const state = await existing.getState();
        if (["failed", "completed"].includes(state)) {
          await existing.remove();
        } else {
          if (row.status !== "QUEUED") {
            await db.mailMessage.update({
              where: { id: row.id },
              data: { status: "QUEUED", queuedAt: new Date() },
            });
          }
          continue;
        }
      }
      await mailQueue.add(
        "deliver",
        { mailId: row.id, attemptNumber: row.attemptCount + 1 },
        {
          jobId,
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
      await db.mailMessage.update({
        where: { id: row.id },
        data: { status: "QUEUED", queuedAt: new Date() },
      });
    }
  } catch (error) {
    log("error", "Mail dispatch unavailable; outbox rows retained", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : "Unknown",
    });
  } finally {
    mailDispatching = false;
  }
}

let generationDispatching = false;
async function dispatchGeneration() {
  if (isShuttingDown || generationDispatching || !bytePlusProvider) return;
  generationDispatching = true;
  try {
    await reapExpiredRecoveryJobs();

    const retryBefore = new Date(Date.now() - 60 * 1000);
    const jobs = await db.generationJob.findMany({
      where: {
        OR: [
          { status: "QUEUED", providerModel: { enabled: true } },
          {
            status: "PROCESSING",
            OR: [
              { errorCode: null },
              { errorCode: { not: null }, updatedAt: { lt: retryBefore } },
            ],
          },
        ],
      },
      select: {
        id: true,
        status: true,
        providerModel: { select: { mediaKind: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    });

    for (const job of jobs) {
      if (isShuttingDown) break;
      const queued = await generationQueue.getJob(job.id);
      if (queued) {
        const state = await queued.getState();
        if (["failed", "completed"].includes(state)) await queued.remove();
        else continue;
      }
      const mediaKind = job.providerModel.mediaKind;
      let jobName: string;
      if (mediaKind === "VIDEO") {
        jobName = job.status === "QUEUED" ? "video-submit" : "video-poll";
      } else if (mediaKind === "VOICE") {
        jobName = "voice";
      } else {
        jobName = "image";
      }
      await generationQueue.add(
        jobName,
        { jobId: job.id },
        {
          jobId: job.id,
          attempts: mediaKind === "VIDEO" || mediaKind === "VOICE" ? 1 : 3,
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
  if (isShuttingDown || reasoningDispatching || !nvidiaProvider) return;
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
      where: { status: "QUEUED", providerModel: { enabled: true } },
      select: { id: true, organizationId: true },
      orderBy: { id: "asc" },
      take: 100,
    });

    for (const job of jobs) {
      if (isShuttingDown) break;
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

const mailDispatchTimer = setInterval(() => void dispatchMail(), 5_000);
const generationDispatchTimer = setInterval(
  () => void dispatchGeneration(),
  10_000,
);
const reasoningDispatchTimer = setInterval(
  () => void dispatchReasoning(),
  2_000,
);
const assetDispatchTimer = setInterval(() => void dispatchAssets(), 15_000);
void dispatchMail();
void dispatchGeneration();
void dispatchReasoning();
void dispatchAssets();

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  log("info", "worker shutting down", { signal });
  isShuttingDown = true;
  clearInterval(mailDispatchTimer);
  clearInterval(generationDispatchTimer);
  clearInterval(reasoningDispatchTimer);
  clearInterval(assetDispatchTimer);

  // Stop accepting new jobs from Redis queues immediately
  await Promise.allSettled([
    mailWorker.pause(true),
    generationWorker.pause(true),
    reasoningWorker.pause(true),
    assetWorker.pause(true),
  ]);

  // Cover the configured provider request deadline, a worst-case 120s media
  // transfer, and 30s for persistence/queue cleanup. Server env validation caps
  // provider request timeouts at 600s, so systemd's stop deadline can cover the
  // maximum valid configuration as well as today's defaults.
  const providerDeadlineMs = Math.max(
    env.BYTEPLUS_REQUEST_TIMEOUT_MS ?? 180_000,
    env.NVIDIA_REQUEST_TIMEOUT_MS ?? 60_000,
  );
  const drainTimeoutMs = providerDeadlineMs + 120_000 + 30_000;
  const drainPromise = Promise.all([
    mailWorker.close(),
    generationWorker.close(),
    reasoningWorker.close(),
    mailQueue.close(),
    generationQueue.close(),
    reasoningQueue.close(),
    assetWorker.close(),
    assetQueue.close(),
    maintenanceWorker.close(),
    closeSmtpTransport(),
  ]);

  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () =>
        reject(
          new Error(
            `Worker drain exceeded bounded deadline of ${drainTimeoutMs}ms`,
          ),
        ),
      drainTimeoutMs,
    );
  });

  try {
    await Promise.race([drainPromise, timeoutPromise]);
    log("info", "all worker jobs drained successfully");
  } catch (error) {
    log("error", "worker drain timed out or failed; forcing closure", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : "Unknown",
    });
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }

  await db.$disconnect();
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
  queues: ["maintenance", "mail", "generation", "reasoning", "asset-ingestion"],
  environment: env.APP_ENV,
  bytePlusConfigured: Boolean(bytePlusProvider),
  nvidiaConfigured: Boolean(nvidiaProvider),
  mailEnabled: env.MAIL_ENABLED,
  mediaEnabled: env.MEDIA_PROCESSING_ENABLED,
  mediaConcurrency: 1,
  mediaThreads: env.MEDIA_THREADS,
});
