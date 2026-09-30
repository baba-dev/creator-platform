import { parseServerEnv } from "@aiwa/config";
import { db } from "@aiwa/db";
import { Queue } from "bullmq";
import Redis from "ioredis";
import {
  abandonMediaTask,
  recoverMediaCapacity,
  retryMediaTask,
} from "../src/media-tasks";
async function main() {
  const [command, id, confirm, ...extra] = process.argv.slice(2);
  const validId = /^[A-Za-z0-9_-]{1,128}$/.test(id ?? "");
  if (
    extra.length ||
    !["status", "retry", "recover-capacity", "abandon"].includes(
      command ?? "",
    ) ||
    (command === "status" && id) ||
    (command === "abandon" && (!validId || confirm !== "--confirm-stopped")) ||
    (command === "retry" &&
      (!validId || (confirm && confirm !== "--confirm-stopped"))) ||
    (command === "recover-capacity" && (id !== "--confirm-stopped" || confirm))
  )
    throw new Error(
      "Usage: media-ops status | retry <taskId> [--confirm-stopped] | abandon <taskId> --confirm-stopped | recover-capacity --confirm-stopped",
    );
  const env = parseServerEnv();
  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
  });
  const queue = new Queue("asset-ingestion", {
    connection: redis,
    prefix: "aiwa",
  });
  try {
    if (command === "status") {
      console.info(
        JSON.stringify({
          enabledInEnvironment: env.MEDIA_PROCESSING_ENABLED,
          paused: await queue.isPaused(),
          globalConcurrency: await queue.getGlobalConcurrency(),
          tasks: await db.mediaTask.groupBy({ by: ["status"], _count: true }),
          capacity: await db.mediaCapacity.findUnique({
            where: { id: "native-media-v1" },
            select: { fence: true, leaseUntil: true, owner: true },
          }),
          attention: await db.mediaTask.findMany({
            where: { status: { in: ["REVIEW", "FAILED"] } },
            select: {
              id: true,
              targetId: true,
              kind: true,
              status: true,
              cycle: true,
              attemptCount: true,
              errorCode: true,
            },
            orderBy: { updatedAt: "desc" },
            take: 50,
          }),
        }),
      );
      return;
    }
    if (command === "recover-capacity") await recoverMediaCapacity();
    else if (command === "abandon") await abandonMediaTask(id!);
    else await retryMediaTask(id!, confirm === "--confirm-stopped");
    console.info(
      JSON.stringify({
        status: "accepted",
        taskId: command === "retry" ? id : undefined,
      }),
    );
  } finally {
    await queue.close();
    redis.disconnect();
    await db.$disconnect();
  }
}
void main().catch(() => {
  console.error(
    "Media operations failed; check command, ownership, asset eligibility and service connectivity.",
  );
  process.exitCode = 1;
});
