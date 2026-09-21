import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Queue, QueueEvents, Worker } from "bullmq";
import Redis from "ioredis";
import { db } from "@aiwa/db";
import type * as Storage from "@aiwa/generation/storage";
import { createImageJob } from "@aiwa/generation";
import { processImageJob } from "@aiwa/generation/process";
import { createBytePlusProvider } from "@aiwa/providers/byteplus";

vi.mock("@aiwa/generation/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof Storage>();
  return {
    ...actual,
    downloadImage: vi
      .fn()
      .mockResolvedValue(Buffer.from("provider PNG fixture")),
  };
});
const enabled = process.env.GENERATION_INTEGRATION_TEST === "true";
const id = `integration-${randomUUID()}`;
const orgId = `${id}-org`,
  userId = `${id}-user`,
  modelId = `${id}-model`,
  priceId = `${id}-price`;
let directory: string;
const request = () => ({
  organizationId: orgId,
  modelId,
  priceVersionId: priceId,
  idempotencyKey: randomUUID(),
  prompt: "Integration test image",
  aspectRatio: "1:1",
});
describe.skipIf(!enabled)("generation with MariaDB and Redis", () => {
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "creator-assets-"));
    process.env.ASSET_STORAGE_ROOT = directory;
    await db.user.create({
      data: {
        id: userId,
        email: `${id}@example.invalid`,
        name: "Integration test",
      },
    });
    await db.organization.create({
      data: {
        id: orgId,
        name: "Integration",
        slug: id,
        ownerUserId: userId,
        memberships: { create: { userId, role: "ORGANIZATION_OWNER" } },
        wallet: { create: { balanceCache: 1000n } },
      },
    });
    await db.providerModel.create({
      data: {
        id: modelId,
        provider: "BYTEPLUS",
        providerModelId: `${id}-temporary`,
        mediaKind: "IMAGE",
        displayName: "Test",
        description: "Test",
        capabilities: {
          "aspectRatio:1:1": true,
          "resolution:2K": true,
          "resolution:4K": true,
        },
        enabled: true,
      },
    });
    // The clean CI database has no seed; canonical ID belongs to this fixture only.
    await db.providerModel.update({
      where: { id: modelId },
      data: { providerModelId: "seedream-5-0-260128" },
    });
    await db.modelPriceVersion.create({
      data: {
        id: priceId,
        providerModelId: modelId,
        providerCostMicroUsd: 54000n,
        customerCredits: 28n,
        fxBaisaNumerator: 769n,
        fxBaisaDenominator: 2n,
        targetMarginBps: 2500,
        effectiveFrom: new Date(0),
        createdById: userId,
      },
    });
  });
  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { organizationId: orgId } });
    await db.asset.deleteMany({ where: { organizationId: orgId } });
    const wallet = await db.wallet.findUnique({
      where: { organizationId: orgId },
    });
    if (wallet) {
      await db.ledgerEntry.deleteMany({
        where: { walletId: wallet.id, reversalOfId: { not: null } },
      });
      await db.ledgerEntry.deleteMany({ where: { walletId: wallet.id } });
    }
    await db.generationJob.deleteMany({ where: { organizationId: orgId } });
    await db.modelPriceVersion.deleteMany({
      where: { providerModelId: modelId },
    });
    await db.providerModel.deleteMany({ where: { id: modelId } });
    await db.wallet.deleteMany({ where: { organizationId: orgId } });
    await db.membership.deleteMany({ where: { organizationId: orgId } });
    await db.organization.deleteMany({ where: { id: orgId } });
    await db.user.deleteMany({ where: { id: userId } });
    if (directory) await rm(directory, { recursive: true, force: true });
    await db.$disconnect();
  });
  it("reserves once for concurrent retries, queues, stores and captures once", async () => {
    const input = request();
    const [a, b] = await Promise.all([
      createImageJob(userId, input),
      createImageJob(userId, input),
    ]);
    expect(a.id).toBe(b.id);
    expect(a.status).toBe("QUEUED");
    const reserved = await db.ledgerEntry.findMany({
      where: { referenceId: a.id },
    });
    expect(reserved).toHaveLength(1);
    expect(reserved[0]?.type).toBe("RESERVATION");
    await expect(
      createImageJob(userId, { ...input, prompt: "Changed" }),
    ).rejects.toThrow("different inputs");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ url: "https://fixture.bytepluscdn.com/result.png" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const provider = createBytePlusProvider({
      apiKey: "test-only",
      region: "ap-southeast-1",
      fetch: fetchMock,
    });
    const connection = new Redis(
      process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
      { maxRetriesPerRequest: null },
    );
    const queue = new Queue(id, { connection });
    const events = new QueueEvents(id, { connection });
    const worker = new Worker(
      id,
      (job) => processImageJob(job.data.jobId, provider),
      { connection },
    );
    try {
      await events.waitUntilReady();
      const queued = await queue.add("image", { jobId: a.id });
      await queued.waitUntilFinished(events, 15000);
      await processImageJob(a.id, provider);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const job = await db.generationJob.findUniqueOrThrow({
        where: { id: a.id },
        include: { assets: true },
      });
      expect(job.status).toBe("SUCCEEDED");
      expect(job.chargedCredits).toBe(a.reservedCredits);
      expect(job.assets[0]?.status).toBe("READY");
      expect(await readFile(join(directory, `${a.id}.png`), "utf8")).toBe(
        "provider PNG fixture",
      );
      const wallet = await db.wallet.findUniqueOrThrow({
        where: { organizationId: orgId },
      });
      expect(wallet.balanceCache).toBe(1000n - a.reservedCredits);
      expect(
        await db.ledgerEntry.count({
          where: { referenceId: a.id, type: "CAPTURE" },
        }),
      ).toBe(1);
    } finally {
      await worker.close();
      await events.close();
      await queue.obliterate({ force: true });
      await queue.close();
      await connection.quit();
    }
  }, 30000);
  it("rolls back insufficient credit and member-cap requests", async () => {
    await db.membership.update({
      where: { organizationId_userId: { organizationId: orgId, userId } },
      data: { monthlySpendingCapCredits: 0n },
    });
    const before = await db.generationJob.count({
      where: { organizationId: orgId },
    });
    await expect(createImageJob(userId, request())).rejects.toThrow(
      "spending cap",
    );
    await db.membership.update({
      where: { organizationId_userId: { organizationId: orgId, userId } },
      data: { monthlySpendingCapCredits: null },
    });
    await db.wallet.update({
      where: { organizationId: orgId },
      data: { balanceCache: 0n },
    });
    await expect(createImageJob(userId, request())).rejects.toThrow(
      "insufficient",
    );
    expect(
      await db.generationJob.count({ where: { organizationId: orgId } }),
    ).toBe(before);
  });
  it("denies viewers and inactive organizations", async () => {
    await db.membership.update({
      where: { organizationId_userId: { organizationId: orgId, userId } },
      data: { role: "ORGANIZATION_VIEWER" },
    });
    await expect(createImageJob(userId, request())).rejects.toThrow(
      "access denied",
    );
    await db.membership.update({
      where: { organizationId_userId: { organizationId: orgId, userId } },
      data: { role: "ORGANIZATION_OWNER" },
    });
    await db.organization.update({
      where: { id: orgId },
      data: { status: "SUSPENDED" },
    });
    await expect(createImageJob(userId, request())).rejects.toThrow(
      "access denied",
    );
  });
});
