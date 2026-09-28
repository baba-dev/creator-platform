import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { $transaction: vi.fn() },
  release: vi.fn(),
}));
vi.mock("@aiwa/db", () => ({ db: mocks.db }));
vi.mock("@aiwa/credits", () => ({ releaseOrRefundCredits: mocks.release }));
import {
  cancelQueuedGenerationJob,
  CancelGenerationError,
} from "../src/cancel";

function fixture(
  status: "QUEUED" | "SUBMITTED" | "PROCESSING" | "CANCELLED" = "QUEUED",
  role = "ORGANIZATION_MEMBER",
) {
  const tx = {
    $queryRaw: vi.fn(),
    generationJob: {
      findUnique: vi.fn().mockResolvedValue({
        id: "job1",
        organizationId: "org1",
        createdById: "user1",
        status,
        chargedCredits: 0n,
        providerRequestId: status === "PROCESSING" ? "video-task" : null,
        providerModelId: "model1",
      }),
      update: vi.fn(),
    },
    membership: {
      findUnique: vi.fn().mockResolvedValue({
        role,
        organization: { status: "ACTIVE" },
        user: { disabledAt: null, emailVerified: true },
      }),
    },
    wallet: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "wallet1" }) },
    ledgerEntry: { findFirst: vi.fn().mockResolvedValue(null) },
    providerModel: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ mediaKind: "VIDEO", provider: "BYTEPLUS" }),
    },
    asset: { updateMany: vi.fn() },
    auditEvent: { create: vi.fn() },
  };
  mocks.db.$transaction.mockImplementation((fn) => fn(tx));
  return tx;
}

const input = {
  jobId: "job1",
  actorUserId: "user1",
  platformRole: "USER" as const,
  idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
};

beforeEach(() => vi.resetAllMocks());

describe("queued generation cancellation", () => {
  it("releases credits, clears pending allocation and audits the cancellation in one transaction", async () => {
    const tx = fixture();
    await expect(cancelQueuedGenerationJob(input)).resolves.toEqual({
      status: "CANCELLED",
    });
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(mocks.release).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        jobId: "job1",
        idempotencyKey: "generation-release-job1",
      }),
    );
    expect(tx.asset.updateMany).toHaveBeenCalledWith({
      where: { generationJobId: "job1", status: "PENDING" },
      data: { status: "DELETED", byteSize: 0n },
    });
    expect(tx.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "CANCELLED" }),
      }),
    );
    expect(tx.auditEvent.create).toHaveBeenCalledOnce();
  });

  it("returns the existing terminal outcome without another ledger entry", async () => {
    fixture("CANCELLED");
    await expect(cancelQueuedGenerationJob(input)).resolves.toEqual({
      status: "CANCELLED",
    });
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("refuses cancellation after the worker has claimed the job", async () => {
    fixture("SUBMITTED");
    await expect(cancelQueuedGenerationJob(input)).rejects.toMatchObject({
      status: 409,
    });
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("refuses a provider task already processing without releasing credits", async () => {
    fixture("PROCESSING");
    await expect(cancelQueuedGenerationJob(input)).rejects.toMatchObject({
      status: 409,
    });
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("never refunds an unexpected capture while cancelling a queued job", async () => {
    const tx = fixture();
    tx.ledgerEntry.findFirst.mockResolvedValue({ id: "capture1" });
    await expect(cancelQueuedGenerationJob(input)).rejects.toMatchObject({
      status: 409,
    });
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("hides another member's job", async () => {
    fixture();
    await expect(
      cancelQueuedGenerationJob({ ...input, actorUserId: "user2" }),
    ).rejects.toBeInstanceOf(CancelGenerationError);
    expect(mocks.release).not.toHaveBeenCalled();
  });
});
