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
      updateMany: vi.fn(),
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
    mocks.db.asset.updateMany.mockResolvedValue({ count: 1 });
    mocks.db.ledgerEntry.findMany.mockResolvedValue([]);
    mocks.db.auditEvent.findMany.mockResolvedValue([]);
    mocks.db.auditEvent.findFirst.mockResolvedValue(null);
    mocks.db.auditEvent.create.mockResolvedValue({ id: "audit-1" });
    mocks.downloadImage.mockResolvedValue(Buffer.from("fake-png"));
    mocks.storeImage.mockResolvedValue({ byteSize: 5000n, sha256: "hash123" });
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
      expect(result?.permittedActions.canRelease).toBe(true);
      expect(result?.permittedActions.canRecover).toBe(true);
      expect(result?.permittedActions.canRefund).toBe(false);
      expect(result?.permittedActions.refundReason).toContain(
        "has not charged any credits",
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
      expect(mocks.db.asset.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { generationJobId: "job-123", objectKey: "job-123.png" },
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
    it("releases credits via ledger, deletes pending storage asset, and marks job FAILED", async () => {
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

    it("refuses to release reservation if job was already settled", async () => {
      mocks.db.generationJob.findUnique.mockResolvedValue({
        ...baseJob,
        status: "SUCCEEDED",
        chargedCredits: 28n,
      });

      await expect(
        releaseJobReservation({
          jobId: "job-123",
          actorUserId: "operator-1",
          reason: "Attempt release on settled job",
          evidence: "None",
          idempotencyKey: "key-error",
        }),
      ).rejects.toThrow("Cannot release reservation on a settled job");
    });
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
