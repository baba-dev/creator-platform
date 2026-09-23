import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Queue, QueueEvents, Worker } from "bullmq";
import Redis from "ioredis";
import { db } from "@aiwa/db";
import { processReasoningJob } from "../src/reasoning";
import { ProviderRequestError, type ReasoningProvider } from "@aiwa/providers";

const enabled = process.env.GENERATION_INTEGRATION_TEST === "true";
const id = `reasoning-integration-${randomUUID()}`;
const orgId = `${id}-org`,
  userId = `${id}-user`,
  modelId = `${id}-model`;

describe.skipIf(!enabled)("reasoning job processing", () => {
  beforeAll(async () => {
    await db.user.create({
      data: {
        id: userId,
        email: `${id}@example.invalid`,
        name: "Reasoning Test",
        emailVerified: true,
      },
    });
    await db.organization.create({
      data: {
        id: orgId,
        name: "Reasoning Integration",
        slug: id,
        ownerUserId: userId,
        memberships: { create: { userId, role: "ORGANIZATION_OWNER" } },
      },
    });
    await db.providerModel.create({
      data: {
        id: modelId,
        provider: "NVIDIA",
        providerModelId: `mock-model`,
        mediaKind: "REASONING",
        displayName: "Reasoning Test Model",
        description: "Reasoning Test Model",
        capabilities: {},
        enabled: true,
      },
    });
  });

  afterAll(async () => {
    await db.reasoningJob.deleteMany({ where: { organizationId: orgId } });
    await db.providerModel.deleteMany({ where: { id: modelId } });
    await db.membership.deleteMany({ where: { organizationId: orgId } });
    await db.organization.deleteMany({ where: { id: orgId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  it("processes a reasoning job successfully", async () => {
    const jobId = `job-${randomUUID()}`;
    await db.reasoningJob.create({
      data: {
        id: jobId,
        organizationId: orgId,
        createdById: userId,
        providerModelId: modelId,
        idempotencyKey: randomUUID(),
        status: "QUEUED",
        requestPayload: {
          task: "prompt-enhancement",
          systemPrompt: "You are a test assistant.",
          userPrompt: "Hello",
          responseSchemaName: "prompt-enhancement-v1",
        },
      },
    });

    const mockProvider: ReasoningProvider = {
      name: "nvidia",
      complete: vi.fn().mockResolvedValue({
        providerRequestId: "nvidia-request-123",
        content: { enhancedPrompt: "Hello world" },
        inputTokens: 10,
        outputTokens: 5,
      }),
    };

    const connection = new Redis(
      process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
      { maxRetriesPerRequest: null },
    );
    const queue = new Queue(id, { connection });
    const events = new QueueEvents(id, { connection });
    const worker = new Worker(
      id,
      (job) => processReasoningJob(job, mockProvider),
      { connection },
    );

    try {
      await events.waitUntilReady();
      const queued = await queue.add("reasoning", { jobId }, { jobId });
      await queued.waitUntilFinished(events, 15000);

      expect(mockProvider.complete).toHaveBeenCalledTimes(1);

      const jobRecord = await db.reasoningJob.findUniqueOrThrow({
        where: { id: jobId },
      });
      expect(jobRecord.status).toBe("SUCCEEDED");
      expect(
        (
          jobRecord.outputPayload as {
            enhancedPrompt?: string;
          } | null
        )?.enhancedPrompt,
      ).toBe("Hello world");
      expect(jobRecord.providerRequestId).toBe("nvidia-request-123");
      expect(jobRecord.inputTokens).toBe(10);
      expect(jobRecord.outputTokens).toBe(5);
    } finally {
      await worker.close();
      await events.close();
      await queue.obliterate({ force: true });
      await queue.close();
      await connection.quit();
    }
  }, 15000);

  it("retries a retryable provider error and then fails", async () => {
    const jobId = `job-retry-${randomUUID()}`;
    await db.reasoningJob.create({
      data: {
        id: jobId,
        organizationId: orgId,
        createdById: userId,
        providerModelId: modelId,
        idempotencyKey: randomUUID(),
        status: "QUEUED",
        requestPayload: {
          task: "prompt-enhancement",
          systemPrompt: "You are a test assistant.",
          userPrompt: "Fail me",
          responseSchemaName: "prompt-enhancement-v1",
        },
      },
    });

    const mockProvider: ReasoningProvider = {
      name: "nvidia",
      complete: vi.fn().mockRejectedValue(
        new ProviderRequestError("Rate limit exceeded", true, {
          code: "RATE_LIMIT",
        }),
      ),
    };

    const connection = new Redis(
      process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
      { maxRetriesPerRequest: null },
    );
    const queue = new Queue(id, { connection });
    const events = new QueueEvents(id, { connection });
    const worker = new Worker(
      id,
      (job) => processReasoningJob(job, mockProvider),
      { connection },
    );

    try {
      await events.waitUntilReady();
      const queued = await queue.add(
        "reasoning",
        { jobId },
        {
          jobId,
          attempts: 3,
          backoff: { type: "fixed", delay: 10 },
        },
      );

      // Wait for it to fail after retries
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Timeout waiting for failure")),
          15000,
        );
        events.on("failed", ({ jobId: eventJobId }) => {
          if (eventJobId === queued.id) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });

      // It should have been called 3 times
      expect(mockProvider.complete).toHaveBeenCalledTimes(3);

      const jobRecord = await db.reasoningJob.findUniqueOrThrow({
        where: { id: jobId },
      });
      expect(jobRecord.status).toBe("FAILED");
      expect(jobRecord.errorCode).toBe("RATE_LIMIT");
    } finally {
      await worker.close();
      await events.close();
      await queue.obliterate({ force: true });
      await queue.close();
      await connection.quit();
    }
  }, 15000);
});
