import { parseServerEnv } from "@aiwa/config";
import { db } from "@aiwa/db";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { retryFailedDerivative } from "../src/asset-dispatch";

async function main() {
  const [command, assetId, ...extra] = process.argv.slice(2);
  if (
    extra.length ||
    !["status", "retry"].includes(command ?? "") ||
    (command === "status" && assetId) ||
    (command === "retry" && !/^[A-Za-z0-9_-]{1,128}$/.test(assetId ?? ""))
  )
    throw new Error("Usage: media-ops status | retry <assetId>");
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
          counts: await queue.getJobCounts(
            "waiting",
            "active",
            "delayed",
            "failed",
          ),
        }),
      );
      return;
    }
    await retryFailedDerivative(queue, assetId!, async (attemptsMade) => {
      const asset = await db.asset.findUnique({ where: { id: assetId! } });
      if (
        !asset ||
        asset.status !== "READY" ||
        asset.storageProvider !== "LOCAL" ||
        !["IMAGE", "VIDEO", "AUDIO"].includes(asset.mediaKind)
      )
        throw new Error("Asset is not eligible for derivative recovery");
      // Record intent before the Redis mutation; never silently reset attempts.
      await db.auditEvent.create({
        data: {
          organizationId: asset.organizationId,
          action: "asset.derivatives_retry_requested",
          targetType: "Asset",
          targetId: asset.id,
          metadata: {
            source: "creator-ops",
            previousAttemptsMade: attemptsMade,
          },
        },
      });
    });
    console.info(JSON.stringify({ status: "queued", assetId }));
  } finally {
    await queue.close();
    redis.disconnect();
    await db.$disconnect();
  }
}

void main().catch(() => {
  console.error(
    "Media operations failed; check command, asset eligibility and service connectivity.",
  );
  process.exitCode = 1;
});
