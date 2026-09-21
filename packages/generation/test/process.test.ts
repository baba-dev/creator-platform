import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  ImageStorageError: class extends Error {
    constructor(
      public readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = "ImageStorageError";
    }
  },
  db: {
    generationJob: {
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  capture: vi.fn(),
  release: vi.fn(),
  download: vi.fn(),
  store: vi.fn(),
  membership: vi.fn(),
}));
vi.mock("@aiwa/db", () => ({ db: mocks.db }));
vi.mock("@aiwa/credits", () => ({
  captureCreditsForJob: mocks.capture,
  releaseOrRefundCredits: mocks.release,
}));
vi.mock("../src/index", () => ({ requireMembership: mocks.membership }));
vi.mock("../src/storage", () => ({
  ImageStorageError: mocks.ImageStorageError,
  downloadImage: mocks.download,
  storeImage: mocks.store,
}));
import {
  ProviderRequestError,
  type MediaGenerationProvider,
} from "@aiwa/providers";
import { processImageJob } from "../src/process";
const base = {
  id: "job1",
  organizationId: "org1",
  createdById: "user1",
  idempotencyKey: "key1",
  requestPayload: { prompt: "test" },
  providerModel: { providerModelId: "seedream-5-0-260128" },
  reservedCredits: 28n,
};
function provider() {
  return {
    name: "byteplus",
    submit: vi.fn(),
    listModels: vi.fn(),
    getJob: vi.fn(),
    cancel: vi.fn(),
  } as unknown as MediaGenerationProvider;
}
function transaction(status = "PROCESSING") {
  const tx = {
    $queryRaw: vi.fn(),
    generationJob: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ ...base, status }),
      update: vi.fn(),
    },
    wallet: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "wallet1" }) },
    asset: { update: vi.fn(), updateMany: vi.fn() },
    auditEvent: { create: vi.fn() },
  };
  mocks.db.$transaction.mockImplementation((fn) => fn(tx));
  return tx;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.db.generationJob.updateMany.mockResolvedValue({ count: 1 });
  mocks.store.mockResolvedValue({ byteSize: 100n, sha256: "hash" });
  mocks.download.mockResolvedValue(Buffer.from("png"));
});
describe("image processing", () => {
  it("stores output before capture and success", async () => {
    const p = provider();
    vi.mocked(p.submit).mockResolvedValue({
      status: "succeeded",
      providerRequestId: "request1",
      outputUrls: ["https://example.bytepluscdn.com/image.png"],
    });
    mocks.db.generationJob.findUniqueOrThrow
      .mockResolvedValueOnce({ ...base, status: "QUEUED" })
      .mockResolvedValueOnce({
        ...base,
        status: "PROCESSING",
        outputPayload: { url: "url" },
      });
    const tx = transaction();
    await processImageJob("job1", p);
    expect(p.submit).toHaveBeenCalledTimes(1);
    expect(mocks.store).toHaveBeenCalledTimes(1);
    expect(mocks.capture).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ amountCredits: 28n }),
    );
    expect(mocks.store.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.capture.mock.invocationCallOrder[0]!,
    );
    expect(tx.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SUCCEEDED" }),
      }),
    );
  });
  it("releases credits on definite provider rejection", async () => {
    const p = provider();
    vi.mocked(p.submit).mockRejectedValue(
      new ProviderRequestError("rejected", false),
    );
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      ...base,
      status: "QUEUED",
    });
    const tx = transaction("SUBMITTED");
    await processImageJob("job1", p);
    expect(mocks.release).toHaveBeenCalledTimes(1);
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(tx.asset.updateMany).toHaveBeenCalled();
  });
  it("keeps reservation and avoids replay after timeout", async () => {
    const p = provider();
    vi.mocked(p.submit).mockRejectedValue(
      new ProviderRequestError("timeout", true),
    );
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      ...base,
      status: "QUEUED",
    });
    await processImageJob("job1", p);
    expect(mocks.db.generationJob.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "MANUAL_REVIEW" }),
      }),
    );
    expect(mocks.release).not.toHaveBeenCalled();
  });
  it("retries storage without another provider call or premature charge", async () => {
    const p = provider();
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      ...base,
      status: "PROCESSING",
      outputPayload: { url: "url" },
    });
    mocks.download.mockRejectedValue(new Error("storage offline"));
    await expect(processImageJob("job1", p)).rejects.toThrow();
    expect(p.submit).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(mocks.db.generationJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job1", status: "PROCESSING" },
        data: expect.objectContaining({
          errorCode: "STORAGE_RECOVERY_FAILED",
          errorMessage:
            "Generated image could not be saved. Credits remain reserved while storage recovery retries.",
        }),
      }),
    );
  });
  it.each(["SUBMITTED", "SUCCEEDED", "FAILED", "CANCELLED", "MANUAL_REVIEW"])(
    "does not replay %s",
    async (status) => {
      const p = provider();
      mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
        ...base,
        status,
      });
      await processImageJob("job1", p);
      expect(p.submit).not.toHaveBeenCalled();
      expect(mocks.capture).not.toHaveBeenCalled();
    },
  );
  it("only the atomic claimant submits", async () => {
    const p = provider();
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      ...base,
      status: "QUEUED",
    });
    mocks.db.generationJob.updateMany.mockResolvedValue({ count: 0 });
    await processImageJob("job1", p);
    expect(p.submit).not.toHaveBeenCalled();
  });
});
