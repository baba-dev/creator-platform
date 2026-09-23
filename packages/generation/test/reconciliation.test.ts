import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    generationJob: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    ledgerEntry: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    asset: {
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    wallet: {
      findUnique: vi.fn(),
    },
    auditEvent: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  capture: vi.fn(),
  releaseOrRefund: vi.fn(),
  downloadImage: vi.fn(),
  storeImage: vi.fn(),
  downloadVideo: vi.fn(),
  storeVideo: vi.fn(),
  readStoredAsset: vi.fn(),
  validateMp3Bytes: vi.fn(),
  deleteStoredAsset: vi.fn(),
}));

vi.mock("@aiwa/db", () => ({ db: mocks.db }));
vi.mock("@aiwa/credits", () => ({
  captureCreditsForJob: mocks.capture,
  releaseOrRefundCredits: mocks.releaseOrRefund,
}));
vi.mock("../src/storage", () => ({
  downloadImage: mocks.downloadImage,
  storeImage: mocks.storeImage,
  downloadVideo: mocks.downloadVideo,
  storeVideo: mocks.storeVideo,
  readStoredAsset: mocks.readStoredAsset,
  validateMp3Bytes: mocks.validateMp3Bytes,
  deleteStoredAsset: mocks.deleteStoredAsset,
}));

import {
  getJobReconciliationDetails,
  reconcileProviderOutcome,
  recoverGeneratedOutput,
  refundSettledJob,
  releaseJobReservation,
} from "../src/reconciliation";

describe("Generation Job Reconciliation", () => {
  const baseJob = {
    id: "job-123",
    status: "MANUAL_REVIEW",
    organizationId: "org-1",
    reservedCredits: 28n,
    chargedCredits: 0n,
    providerRequestId: null,
    actualProviderCostMicroUsd: null,
    errorCode: "PROVIDER_OUTCOME_UNKNOWN",
    errorMessage: "Provider outcome needs review. Credits remain reserved.",
    outputPayload: { url: "https://trusted.bytepluscdn.com/test.png" },
    organization: {
      id: "org-1",
      name: "Acme Studios",
      slug: "acme",
      status: "ACTIVE",
      wallet: { id: "wallet-1", balanceCache: 100n },
    },
    project: null,
    createdBy: { id: "user-1", name: "Alice", email: "alice@example.com" },
    providerModel: {
      id: "model-1",
      displayName: "Seedream 5.0 Lite",
      providerModelId: "seedream-5-0-260128",
      provider: "BYTEPLUS",
      mediaKind: "IMAGE",
    },
    priceVersion: {
      id: "price-1",
      providerCostMicroUsd: 15000n,
      customerCredits: 28n,
      targetMarginBps: 2000,
      pricingDimension: "REQUEST",
      unitQuantity: 1,
    },
    assets: [
      {
        id: "asset-1",
        objectKey: "job-123.png",
        status: "PENDING",
        mimeType: "image/png",
        byteSize: 26214400n,
        sha256: null,
        width: null,
        height: null,
        durationMs: null,
        createdAt: new Date(),
      },
    ],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.db.generationJob.findUnique.mockResolvedValue(baseJob);
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue(baseJob);
    mocks.db.generationJob.update.mockResolvedValue(baseJob);
    mocks.db.generationJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.db.asset.update.mockResolvedValue({ id: "asset-1" });
    mocks.db.asset.updateMany.mockResolvedValue({ count: 1 });
    mocks.db.wallet.findUnique.mockResolvedValue({
      id: "wallet-1",
      balanceCache: 100n,
    });
    mocks.db.ledgerEntry.findMany.mockResolvedValue([]);
    mocks.db.auditEvent.findMany.mockImplementation(
      ({ where }: { where?: { action?: string } } = {}) => {
        if (where?.action === "generation.reconciled") {
          return Promise.resolve([
            {
              id: "audit-reconcile-success",
              action: "generation.reconciled",
              metadata: { outcome: "SUCCEEDED" },
            },
          ]);
        }
        return Promise.resolve([]);
      },
    );
    mocks.db.auditEvent.findFirst.mockResolvedValue(null);
    mocks.db.auditEvent.create.mockResolvedValue({ id: "audit-1" });
    mocks.downloadImage.mockResolvedValue(Buffer.from("fake-png"));
    mocks.storeImage.mockResolvedValue({ byteSize: 5000n, sha256: "hash123" });
    mocks.storeVideo.mockResolvedValue({
      byteSize: 7000n,
      sha256: "videohash",
    });
    mocks.readStoredAsset.mockResolvedValue(Buffer.from("valid-mp3"));
    mocks.validateMp3Bytes.mockReturnValue({ durationMs: null });
    mocks.capture.mockResolvedValue({ id: "entry-capture", type: "CAPTURE" });
    mocks.releaseOrRefund.mockResolvedValue({
      id: "entry-release",
      type: "RELEASE",
    });
    mocks.db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => {
      const tx = {
        $queryRaw: vi.fn(),
        generationJob: mocks.db.generationJob,
        ledgerEntry: mocks.db.ledgerEntry,
        asset: mocks.db.asset,
        wallet: mocks.db.wallet,
        auditEvent: mocks.db.auditEvent,
      };
      return fn(tx);
    });
  });

  describe("getJobReconciliationDetails", () => {
    it("evaluates permitted actions correctly for MANUAL_REVIEW job with reservation", async () => {
      mocks.db.ledgerEntry.findMany.mockResolvedValue([
        {
          id: "entry-1",
          type: "RESERVATION",
          amountCredits: 28n,
          balanceAfter: 72n,
        },
      ]);

      const result = await getJobReconciliationDetails("job-123");
      expect(result).not.toBeNull();
      expect(result?.permittedActions.canReconcile).toBe(true);
      expect(result?.permittedActions.canRelease).toBe(false);
      expect(result?.permittedActions.canRecover).toBe(false);
      expect(result?.permittedActions.canRefund).toBe(false);
      expect(result?.permittedActions.releaseReason).toContain("Reconcile");
      expect(result?.permittedActions.refundReason).toContain(
        "credits to refund",
      );
    });

    it("evaluates permitted actions correctly for SUCCEEDED job with capture", async () => {
      mocks.db.generationJob.findUnique.mockResolvedValue({
        ...baseJob,
        status: "SUCCEEDED",
        chargedCredits: 28n,
      });
      mocks.db.ledgerEntry.findMany.mockResolvedValue([
        {
          id: "entry-1",
          type: "RESERVATION",
          amountCredits: 28n,
          balanceAfter: 72n,
        },
        {
          id: "entry-2",
          type: "CAPTURE",
          amountCredits: 28n,
          balanceAfter: 72n,
          reversedBy: null,
        },
      ]);

      const result = await getJobReconciliationDetails("job-123");
      expect(result?.permittedActions.canRelease).toBe(false);
      expect(result?.permittedActions.canRecover).toBe(false);
      expect(result?.permittedActions.canRefund).toBe(true);
    });
  });

  describe("reconcileProviderOutcome", () => {
    it("records verified outcome, updates provider requestId and creates audit event", async () => {
      const result = await reconcileProviderOutcome({
        jobId: "job-123",
        actorUserId: "operator-1",
        outcome: "FAILED",
        evidence:
          "BytePlus ticket #BP-8812 confirms model internal timeout before GPU allocation",
        providerRequestId: "bp-req-456",
        notes: "Confirmed no billable tokens used",
        idempotencyKey: "reconcile-key-1",
      });

      expect(result.success).toBe(true);
      expect(mocks.db.generationJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "job-123" },
          data: expect.objectContaining({
            providerRequestId: "bp-req-456",
            errorCode: "PROVIDER_CONFIRMED_FAILED",
          }),
        }),
      );
      expect(mocks.db.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "generation.reconciled",
            targetType: "GenerationJob",
            targetId: "job-123",
            metadata: expect.objectContaining({
              outcome: "FAILED",
              evidence: expect.stringContaining("BP-8812"),
            }),
          }),
        }),
      );
    });
  });

  describe("recoverGeneratedOutput", () => {
    it("recovers image output immediately, captures credits, and marks job SUCCEEDED", async () => {
      const result = await recoverGeneratedOutput({
        jobId: "job-123",
        actorUserId: "operator-1",
        reason: "Recovering output verified from BytePlus URL",
        mode: "immediate",
        idempotencyKey: "recover-key-1",
      });

      expect(result.success).toBe(true);
      expect(mocks.downloadImage).toHaveBeenCalledWith(
        "https://trusted.bytepluscdn.com/test.png",
      );
      expect(mocks.storeImage).toHaveBeenCalledWith(
        "job-123.png",
        expect.any(Buffer),
      );
      expect(mocks.capture).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          walletId: "wallet-1",
          jobId: "job-123",
          amountCredits: 28n,
        }),
      );
      expect(mocks.db.asset.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { objectKey: "job-123.png" },
          data: expect.objectContaining({ status: "READY" }),
        }),
      );
      expect(mocks.db.generationJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "job-123" },
          data: expect.objectContaining({ status: "SUCCEEDED" }),
        }),
      );
      expect(mocks.db.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: "generation.recovered" }),
        }),
      );
    });

    it("resumes processing mode by transitioning to PROCESSING", async () => {
      const result = await recoverGeneratedOutput({
        jobId: "job-123",
        actorUserId: "operator-1",
        reason:
          "Network recovered, letting background worker complete storage retry",
        mode: "resume_processing",
        idempotencyKey: "recover-key-2",
      });

      expect(result.success).toBe(true);
      expect(mocks.db.generationJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "job-123" },
          data: expect.objectContaining({
            status: "PROCESSING",
            errorCode: null,
            errorMessage: null,
          }),
        }),
      );
      expect(mocks.db.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "generation.resumed_processing",
          }),
        }),
      );
    });
  });

  describe("releaseJobReservation", () => {
    it("releases credits only after a reconciled non-success outcome", async () => {
      mocks.db.auditEvent.findMany.mockImplementation(
        ({ where }: { where?: { action?: string } } = {}) => {
          if (where?.action === "generation.reconciled") {
            return Promise.resolve([
              {
                id: "audit-reconcile-failed",
                action: "generation.reconciled",
                metadata: { outcome: "FAILED" },
              },
            ]);
          }
          return Promise.resolve([]);
        },
      );

      const result = await releaseJobReservation({
        jobId: "job-123",
        actorUserId: "operator-1",
        reason:
          "Request timed out at provider before submission, no provider cost occurred.",
        evidence:
          "BytePlus API gateway 504 gateway timeout, zero usage logs in console",
        idempotencyKey: "release-key-1",
      });

      expect(result.success).toBe(true);
      expect(mocks.releaseOrRefund).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          walletId: "wallet-1",
          jobId: "job-123",
          amountCredits: 28n,
          reason: expect.stringContaining("timed out"),
        }),
      );
      // Ensures pending storage is immediately released
      expect(mocks.db.asset.updateMany).toHaveBeenCalledWith({
        where: { generationJobId: "job-123", status: "PENDING" },
        data: { status: "DELETED", byteSize: 0n },
      });
      expect(mocks.db.generationJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "job-123" },
          data: expect.objectContaining({
            status: "FAILED",
            reservedCredits: 0n,
            errorCode: "ADMIN_RELEASED",
          }),
        }),
      );
      expect(mocks.db.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "generation.reservation_released",
          }),
        }),
      );
    });

    it("refuses to release a MANUAL_REVIEW reservation before reconciliation", async () => {
      mocks.db.auditEvent.findMany.mockResolvedValue([]);

      await expect(
        releaseJobReservation({
          jobId: "job-123",
          actorUserId: "operator-1",
          reason: "Attempt release without reconciliation",
          evidence: "Provider outcome is still unknown",
          idempotencyKey: "key-error",
        }),
      ).rejects.toThrow("Reconcile the provider outcome");
      expect(mocks.releaseOrRefund).not.toHaveBeenCalled();
    });
  });

  it("finalizes an already-stored voice output without resubmitting synthesis", async () => {
    mocks.db.generationJob.findUnique.mockResolvedValue({
      ...baseJob,
      providerModel: { ...baseJob.providerModel, mediaKind: "VOICE" },
      outputPayload: { stored: true },
      assets: [
        {
          ...baseJob.assets[0],
          objectKey: "job-123.mp3",
          mimeType: "audio/mpeg",
        },
      ],
    });
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      ...baseJob,
      providerModel: { ...baseJob.providerModel, mediaKind: "VOICE" },
    });

    const result = await recoverGeneratedOutput({
      jobId: "job-123",
      actorUserId: "operator-1",
      reason: "Finalize MP3 already persisted by original synthesis",
      mode: "immediate",
      idempotencyKey: "recover-voice-key",
    });

    expect(result.success).toBe(true);
    expect(mocks.readStoredAsset).toHaveBeenCalledWith("job-123.mp3");
    expect(mocks.validateMp3Bytes).toHaveBeenCalled();
    expect(mocks.downloadImage).not.toHaveBeenCalled();
    expect(mocks.downloadVideo).not.toHaveBeenCalled();
    expect(mocks.db.asset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { objectKey: "job-123.mp3" },
        data: expect.objectContaining({ status: "READY" }),
      }),
    );
  });

  describe("refundSettledJob", () => {
    it("creates refund ledger entry and audit event for settled job", async () => {
      mocks.db.generationJob.findUnique.mockResolvedValue({
        ...baseJob,
        status: "SUCCEEDED",
        chargedCredits: 28n,
      });
      mocks.db.ledgerEntry.findFirst.mockResolvedValue({
        id: "entry-cap",
        type: "CAPTURE",
        amountCredits: 28n,
        reversedBy: null,
      });

      const result = await refundSettledJob({
        jobId: "job-123",
        actorUserId: "operator-1",
        reason:
          "Customer reported corrupted image artifacts caused by provider model bug",
        amountCredits: 28n,
        idempotencyKey: "refund-key-1",
      });

      expect(result.success).toBe(true);
      expect(mocks.releaseOrRefund).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          walletId: "wallet-1",
          jobId: "job-123",
          amountCredits: 28n,
          reason: expect.stringContaining("corrupted image"),
        }),
      );
      expect(mocks.db.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: "generation.refunded" }),
        }),
      );
    });

    it("rejects refund if job has already been refunded", async () => {
      mocks.db.generationJob.findUnique.mockResolvedValue({
        ...baseJob,
        status: "SUCCEEDED",
        chargedCredits: 28n,
      });
      mocks.db.ledgerEntry.findFirst.mockResolvedValue({
        id: "entry-cap",
        type: "CAPTURE",
        amountCredits: 28n,
        reversedBy: { id: "entry-ref", type: "REFUND" },
      });

      await expect(
        refundSettledJob({
          jobId: "job-123",
          actorUserId: "operator-1",
          reason: "Duplicate refund attempt",
          idempotencyKey: "dup-key",
        }),
      ).rejects.toThrow("Job has already been refunded");
    });
  });
});
