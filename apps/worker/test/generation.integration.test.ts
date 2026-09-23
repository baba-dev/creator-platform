import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Queue, QueueEvents, Worker } from "bullmq";
import Redis from "ioredis";
import { db } from "@aiwa/db";
import type * as Storage from "@aiwa/generation/storage";
import {
  createImageJob,
  createVideoJob,
  createVoiceJob,
  reconcileProviderOutcome,
  recoverGeneratedOutput,
  releaseJobReservation,
} from "@aiwa/generation";
import {
  processImageJob,
  processVideoSubmitJob,
  processVideoPollJob,
  processVoiceJob,
} from "@aiwa/generation/process";
import { createBytePlusProvider } from "@aiwa/providers/byteplus";

vi.mock("@aiwa/generation/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof Storage>();
  return {
    ...actual,
    downloadImage: vi
      .fn()
      .mockResolvedValue(Buffer.from("provider PNG fixture")),
    downloadVideo: vi
      .fn()
      .mockResolvedValue(
        Buffer.concat([
          Buffer.from([0, 0, 0, 0]),
          Buffer.from("ftyp"),
          Buffer.from(" fake video"),
        ]),
      ),
  };
});
const enabled = process.env.GENERATION_INTEGRATION_TEST === "true";
const id = `integration-${randomUUID()}`;
const orgId = `${id}-org`,
  userId = `${id}-user`,
  modelId = `${id}-model`,
  priceId = `${id}-price`,
  videoModelId = `${id}-video-model`,
  videoPriceId = `${id}-video-price`;
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
        emailVerified: true,
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
        customerCredits: 84n,
        fxBaisaNumerator: 769n,
        fxBaisaDenominator: 2n,
        targetMarginBps: 2500,
        creditsPerBaisa: 3n,
        effectiveFrom: new Date(0),
        createdById: userId,
      },
    });

    await db.providerModel.create({
      data: {
        id: videoModelId,
        provider: "BYTEPLUS",
        providerModelId: "dreamina-seedance-2-5-260628",
        mediaKind: "VIDEO",
        displayName: "Test Video",
        description: "Test Video",
        capabilities: {
          "aspectRatio:16:9": true,
          "resolution:1080p": true,
          "durationSeconds:5": true,
        },
        enabled: true,
      },
    });
    await db.modelPriceVersion.create({
      data: {
        id: videoPriceId,
        providerModelId: videoModelId,
        providerCostMicroUsd: 100000n,
        customerCredits: 50n,
        fxBaisaNumerator: 769n,
        fxBaisaDenominator: 2n,
        targetMarginBps: 2500,
        creditsPerBaisa: 1n,
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
      where: { providerModelId: { in: [modelId, videoModelId] } },
    });
    await db.providerModel.deleteMany({
      where: { id: { in: [modelId, videoModelId] } },
    });
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
    expect(reserved[0]?.amountCredits).toBe(84n);
    expect(a.reservedCredits).toBe(84n);
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
      expect(job.chargedCredits).toBe(84n);
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

  it("processes video jobs asynchronously via submit and poll", async () => {
    const videoInput = {
      ...request(),
      modelId: videoModelId,
      priceVersionId: videoPriceId,
      prompt: "Video test prompt",
      aspectRatio: "16:9",
      resolution: "1080p",
      durationSeconds: 5,
    };

    const jobRecord = await createVideoJob(userId, videoInput);
    expect(jobRecord.status).toBe("QUEUED");

    const submitMock = vi.fn().mockResolvedValue({
      providerRequestId: "mock-task-id",
      status: "submitted",
    });
    const getJobMock = vi.fn().mockResolvedValue({
      providerRequestId: "mock-task-id",
      status: "succeeded",
      outputUrls: ["https://fixture.bytepluscdn.com/result.mp4"],
    });

    const provider = {
      name: "byteplus" as const,
      listModels: vi.fn(),
      cancel: vi.fn(),
      submit: submitMock,
      getJob: getJobMock,
    };

    await processVideoSubmitJob(jobRecord.id, provider);
    expect(submitMock).toHaveBeenCalledTimes(1);

    const processingJob = await db.generationJob.findUniqueOrThrow({
      where: { id: jobRecord.id },
    });
    expect(processingJob.status).toBe("PROCESSING");
    expect(processingJob.providerRequestId).toBe("mock-task-id");

    await processVideoPollJob(jobRecord.id, provider);
    expect(getJobMock).toHaveBeenCalledTimes(1);

    const finishedJob = await db.generationJob.findUniqueOrThrow({
      where: { id: jobRecord.id },
      include: { assets: true },
    });

    expect(finishedJob.status).toBe("SUCCEEDED");
    expect(finishedJob.assets[0]?.status).toBe("READY");
    expect(finishedJob.assets[0]?.mimeType).toBe("video/mp4");
  }, 10000);

  it("quotes voice by character blocks and finalizes stored MP3 audio", async () => {
    const voiceModel = await db.providerModel.findUniqueOrThrow({
      where: {
        provider_providerModelId: {
          provider: "BYTEPLUS",
          providerModelId: "seed-tts-2.0",
        },
      },
      include: {
        priceVersions: {
          where: { effectiveTo: null },
          orderBy: { effectiveFrom: "desc" },
          take: 1,
        },
      },
    });
    const price = voiceModel.priceVersions[0]!;
    const voiceJob = await createVoiceJob(userId, {
      organizationId: orgId,
      modelId: voiceModel.id,
      priceVersionId: price.id,
      idempotencyKey: randomUUID(),
      text: `  ${"A".repeat(1500)}  `,
      voiceKey: "jasper",
      speechRate: 1.2,
      format: "mp3",
    });
    expect(voiceJob.quotedUnits).toBe(2);
    expect(voiceJob.billableQuantity).toBe(1500);

    const frame = Buffer.concat([
      Buffer.from([0xff, 0xfb, 0x90, 0x64]),
      Buffer.alloc(413),
    ]);
    const audio = Buffer.concat([frame, frame]);
    const provider = {
      name: "byteplus" as const,
      listModels: vi.fn(),
      cancel: vi.fn(),
      getJob: vi.fn(),
      submit: vi.fn().mockResolvedValue({
        providerRequestId: "voice-request-1",
        status: "succeeded" as const,
        inlineOutputs: [
          { mediaType: "audio/mpeg", dataBase64: audio.toString("base64") },
        ],
      }),
    };

    await processVoiceJob(voiceJob.id, provider);

    const completed = await db.generationJob.findUniqueOrThrow({
      where: { id: voiceJob.id },
      include: { assets: true },
    });
    expect(completed.status).toBe("SUCCEEDED");
    expect(completed.actualUnits).toBe(2);
    expect(completed.actualProviderCostMicroUsd).toBe(60_000n);
    expect(completed.assets[0]).toMatchObject({
      mimeType: "audio/mpeg",
      status: "READY",
    });
    expect(await readFile(join(directory, `${voiceJob.id}.mp3`))).toEqual(
      audio,
    );
  }, 10000);

  it("requires reconciliation before release and clears the real reservation projection", async () => {
    await db.organization.update({
      where: { id: orgId },
      data: { status: "ACTIVE" },
    });
    await db.membership.update({
      where: { organizationId_userId: { organizationId: orgId, userId } },
      data: {
        role: "ORGANIZATION_OWNER",
        monthlySpendingCapCredits: null,
      },
    });
    await db.wallet.update({
      where: { organizationId: orgId },
      data: { balanceCache: 1000n },
    });

    const held = await createImageJob(userId, request());
    await db.generationJob.update({
      where: { id: held.id },
      data: {
        status: "MANUAL_REVIEW",
        errorCode: "PROVIDER_OUTCOME_UNKNOWN",
        errorMessage: "Integration fixture requires reconciliation.",
      },
    });

    await expect(
      releaseJobReservation({
        jobId: held.id,
        actorUserId: userId,
        reason: "No provider charge occurred.",
        evidence: "No reconciliation has been recorded yet.",
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow("Reconcile the provider outcome");

    await reconcileProviderOutcome({
      jobId: held.id,
      actorUserId: userId,
      outcome: "NOT_SUBMITTED",
      evidence: "Provider console confirms the request was never accepted.",
      idempotencyKey: randomUUID(),
    });

    const releaseKey = randomUUID();
    const first = await releaseJobReservation({
      jobId: held.id,
      actorUserId: userId,
      reason: "Provider confirms no billable submission.",
      evidence: "Provider console shows no task and no charge.",
      idempotencyKey: releaseKey,
    });
    const replay = await releaseJobReservation({
      jobId: held.id,
      actorUserId: userId,
      reason: "Provider confirms no billable submission.",
      evidence: "Provider console shows no task and no charge.",
      idempotencyKey: releaseKey,
    });

    expect(first.success).toBe(true);
    expect(replay.success).toBe(true);

    const resolved = await db.generationJob.findUniqueOrThrow({
      where: { id: held.id },
      include: { assets: true },
    });
    expect(resolved.status).toBe("FAILED");
    expect(resolved.reservedCredits).toBe(0n);
    expect(resolved.chargedCredits).toBe(0n);
    expect(resolved.assets[0]).toMatchObject({
      status: "DELETED",
      byteSize: 0n,
    });

    const wallet = await db.wallet.findUniqueOrThrow({
      where: { organizationId: orgId },
    });
    expect(wallet.balanceCache).toBe(1000n);
    expect(
      await db.ledgerEntry.count({
        where: { referenceId: held.id, type: "RELEASE" },
      }),
    ).toBe(1);
  }, 10000);

  it("recovers verified output once and captures the real reservation once", async () => {
    await db.wallet.update({
      where: { organizationId: orgId },
      data: { balanceCache: 1000n },
    });

    const held = await createImageJob(userId, request());
    await db.generationJob.update({
      where: { id: held.id },
      data: {
        status: "MANUAL_REVIEW",
        outputPayload: {
          url: "https://fixture.bytepluscdn.com/recovered.png",
        },
        errorCode: "STORAGE_FAILED",
        errorMessage: "Generated output requires administrative recovery.",
      },
    });

    await reconcileProviderOutcome({
      jobId: held.id,
      actorUserId: userId,
      outcome: "SUCCEEDED",
      evidence: "Provider console confirms generation succeeded.",
      idempotencyKey: randomUUID(),
    });

    const recoverKey = randomUUID();
    const first = await recoverGeneratedOutput({
      jobId: held.id,
      actorUserId: userId,
      reason: "Finalize the provider output already generated.",
      mode: "immediate",
      idempotencyKey: recoverKey,
    });
    const replay = await recoverGeneratedOutput({
      jobId: held.id,
      actorUserId: userId,
      reason: "Finalize the provider output already generated.",
      mode: "immediate",
      idempotencyKey: recoverKey,
    });

    expect(first.success).toBe(true);
    expect(replay.success).toBe(true);

    const resolved = await db.generationJob.findUniqueOrThrow({
      where: { id: held.id },
      include: { assets: true },
    });
    expect(resolved.status).toBe("SUCCEEDED");
    expect(resolved.chargedCredits).toBe(held.reservedCredits);
    expect(resolved.assets[0]?.status).toBe("READY");
    expect(
      await db.ledgerEntry.count({
        where: { referenceId: held.id, type: "CAPTURE" },
      }),
    ).toBe(1);
  }, 10000);

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
