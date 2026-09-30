import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { Queue, QueueEvents } from "bullmq";
import Redis from "ioredis";
import { expect, it } from "vitest";

const enabled = process.env.GENERATION_INTEGRATION_TEST === "true";
it.skipIf(!enabled)(
  "core stays responsive while the media process is suspended",
  async () => {
    const connection = new Redis(
      process.env.REDIS_URL ?? "redis://127.0.0.1:6379/0",
      {
        maxRetriesPerRequest: null,
      },
    );
    const queue = new Queue("maintenance", { connection, prefix: "aiwa" });
    const mediaQueue = new Queue("asset-ingestion", {
      connection,
      prefix: "aiwa",
    });
    const events = new QueueEvents("maintenance", {
      connection,
      prefix: "aiwa",
    });
    const children: ChildProcess[] = [];
    async function start(role: string) {
      const child = spawn(
        process.execPath,
        ["--import", "tsx", "src/index.ts"],
        {
          env: {
            ...process.env,
            WORKER_ROLE: role,
            MAIL_ENABLED: "false",
            MEDIA_PROCESSING_ENABLED: "false",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      children.push(child);
      await new Promise<void>((resolve, reject) => {
        const deadline = setTimeout(
          () => reject(new Error("Worker startup deadline")),
          10_000,
        );
        child.once("exit", () => {
          clearTimeout(deadline);
          reject(new Error("Worker exited before startup"));
        });
        let output = "";
        child.stdout!.on("data", (chunk) => {
          output += String(chunk);
          if (
            output.includes(
              role === "media"
                ? "Media processing paused"
                : '"message":"worker started"',
            )
          ) {
            clearTimeout(deadline);
            resolve();
          }
        });
      });
      return child;
    }
    try {
      await events.waitUntilReady();
      const media = await start("media");
      await mediaQueue.resume();
      await start("core");
      // Core's disabled media flag must never pause another role's queue.
      expect(await mediaQueue.isPaused()).toBe(false);
      media.kill("SIGSTOP");
      const job = await queue.add(
        "isolation-probe",
        {},
        { jobId: randomUUID(), removeOnComplete: true },
      );
      expect(await job.waitUntilFinished(events, 5_000)).toHaveProperty(
        "processedAt",
      );
    } finally {
      for (const child of children) {
        if (child.exitCode !== null || child.signalCode !== null) continue;
        child.kill("SIGCONT");
        const exited = once(child, "exit");
        child.kill("SIGTERM");
        const deadline = setTimeout(() => child.kill("SIGKILL"), 5_000);
        await exited;
        clearTimeout(deadline);
      }
      await Promise.all([queue.close(), mediaQueue.close(), events.close()]);
      await connection.quit();
    }
  },
  30_000,
);
