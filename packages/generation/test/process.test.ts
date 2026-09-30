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
    providerModel: {
      findUnique: vi.fn(),
    },
    generationInputAsset: { findMany: vi.fn() },
    asset: { findFirstOrThrow: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
  capture: vi.fn(),
  release: vi.fn(),
  download: vi.fn(),
  store: vi.fn(),
  downloadVideo: vi.fn(),
  storeVideo: vi.fn(),
  storeAudio: vi.fn(),
  storedAssetSize: vi.fn(),
  membership: vi.fn(),
  finalizeAssetStorage: vi.fn(),
  releaseAssetStorage: vi.fn(),
}));
vi.mock("@aiwa/db", () => ({ db: mocks.db }));
vi.mock("@aiwa/config", () => ({
  parseServerEnv: () => ({
    APP_URL: "https://creator.example.com",
    AUTH_SECRET: "a".repeat(48),
  }),
}));
vi.mock("@aiwa/credits", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  captureCreditsForJob: mocks.capture,
  releaseOrRefundCredits: mocks.release,
}));
vi.mock("@aiwa/assets", () => ({
  finalizeAssetStorage: mocks.finalizeAssetStorage,
  releaseAssetStorage: mocks.releaseAssetStorage,
}));
vi.mock("../src/index", () => ({ requireMembership: mocks.membership }));
vi.mock("../src/storage", () => ({
  ImageStorageError: mocks.ImageStorageError,
  downloadImage: mocks.download,
  storeImage: mocks.store,
  downloadVideo: mocks.downloadVideo,
  storeVideo: mocks.storeVideo,
  storeAudio: mocks.storeAudio,
  storedAssetSize: mocks.storedAssetSize,
}));
import {
  ProviderConfigurationError,
  ProviderRequestError,
  type MediaGenerationProvider,
} from "@aiwa/providers";
import {
  failJob,
  processImageJob,
  processVideoPollJob,
  processVideoSubmitJob,
  processVoiceJob,
} from "../src/process";
const base = {
  id: "job1",
  organizationId: "org1",
  createdById: "user1",
  idempotencyKey: "key1",
  requestPayload: { prompt: "test" },
  providerModel: { providerModelId: "seedream-5-0-260128" },
  priceVersion: { providerCostMicroUsd: 54_000n },
  quotedUnits: 1,
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
function transaction(
  status = "PROCESSING",
  job: Record<string, unknown> = base,
) {
  const tx = {
    $queryRaw: vi.fn(),
    generationJob: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ ...job, status }),
      update: vi.fn(),
    },
    wallet: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "wallet1" }) },
    asset: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        byteSize: 25_000_000n,
        status: "PENDING",
      }),
      aggregate: vi.fn().mockResolvedValue({
        _sum: { byteSize: 25_000_000n },
      }),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue([
        {
          id: "asset1",
          generationOutputIndex: 0,
          objectKey: "job1.png",
          mimeType: "image/png",
          byteSize: 25_000_000n,
          status: "READY",
        },
      ]),
    },
    auditEvent: { create: vi.fn() },
  };
  mocks.db.$transaction.mockImplementation((fn) => fn(tx));
  return tx;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.db.generationJob.updateMany.mockResolvedValue({ count: 1 });
  mocks.db.providerModel.findUnique.mockResolvedValue({ enabled: true });
  mocks.db.asset.findFirstOrThrow.mockResolvedValue({
    objectKey: "job1.png",
    mimeType: "image/png",
  });
  mocks.db.asset.findMany.mockResolvedValue([
    {
      id: "asset1",
      generationOutputIndex: 0,
      objectKey: "job1.png",
      mimeType: "image/png",
      byteSize: 25_000_000n,
      status: "PENDING",
      sourceType: "GENERATED",
      mediaKind: "IMAGE",
    },
  ]);
  mocks.store.mockResolvedValue({ byteSize: 100n, sha256: "hash" });
  mocks.download.mockResolvedValue(Buffer.from("png"));
  mocks.downloadVideo.mockResolvedValue(Buffer.from("mp4"));
  mocks.storeVideo.mockResolvedValue({ byteSize: 200n, sha256: "video-hash" });
  mocks.storeAudio.mockResolvedValue({ byteSize: 300n, sha256: "audio-hash" });
  mocks.storedAssetSize.mockResolvedValue(300);
  mocks.finalizeAssetStorage.mockResolvedValue(undefined);
  mocks.releaseAssetStorage.mockResolvedValue(undefined);
});

describe("video processing", () => {
  it("does not release credits when an operator moved a stale failure into review", async () => {
    const tx = transaction("MANUAL_REVIEW");
    await failJob("job1", "Provider rejected the request.", "PROCESSING");
    expect(mocks.release).not.toHaveBeenCalled();
    expect(tx.asset.updateMany).not.toHaveBeenCalled();
    expect(tx.generationJob.update).not.toHaveBeenCalled();
  });

  it("does not turn a reconciled video into FAILED after a stale poll", async () => {
    const p = provider();
    vi.mocked(p.getJob).mockResolvedValue({
      status: "failed",
      providerRequestId: "video-request-1",
    });
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      ...base,
      status: "PROCESSING",
      providerRequestId: "video-request-1",
    });
    const tx = transaction("MANUAL_REVIEW");
    await processVideoPollJob("job1", p);
    expect(mocks.release).not.toHaveBeenCalled();
    expect(tx.generationJob.update).not.toHaveBeenCalled();
  });

  it("submits a queued video exactly once and records its provider task", async () => {
    const p = provider();
    vi.mocked(p.submit).mockResolvedValue({
      status: "submitted",
      providerRequestId: "video-request-1",
    });
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      ...base,
      status: "QUEUED",
    });

    await processVideoSubmitJob("job1", p);

    expect(p.submit).toHaveBeenCalledWith(
      expect.objectContaining({ mediaKind: "video" }),
    );
    expect(mocks.db.generationJob.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "job1", status: "SUBMITTED" },
        data: expect.objectContaining({
          status: "PROCESSING",
          providerRequestId: "video-request-1",
        }),
      }),
    );
  });

  it("submits only a linked private source video through a scoped grant", async () => {
    const p = provider();
    vi.mocked(p.submit).mockResolvedValue({
      status: "submitted",
      providerRequestId: "video-reference-1",
    });
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      ...base,
      status: "QUEUED",
      requestPayload: { prompt: "test", referenceVideoAssetId: "source1" },
    });
    mocks.db.generationInputAsset.findMany.mockResolvedValue([
      {
        assetId: "source1",
        asset: {
          id: "source1",
          organizationId: "org1",
          status: "READY",
          mediaKind: "VIDEO",
          mimeType: "video/mp4",
          storageProvider: "LOCAL",
          purpose: "REFERENCE_INPUT",
          storageOwnerUserId: "user1",
        },
      },
    ]);
    await processVideoSubmitJob("job1", p);
    expect(p.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          referenceVideoUrl: expect.stringMatching(
            /^https:\/\/creator\.example\.com\/api\/provider-media\/source1\?jobId=job1&grant=v1\./,
          ),
        }),
      }),
    );
  });

  it("keeps credits reserved while a video is still processing", async () => {
    const p = provider();
    vi.mocked(p.getJob).mockResolvedValue({
      status: "processing",
      providerRequestId: "video-request-1",
    });
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      ...base,
      status: "PROCESSING",
      providerRequestId: "video-request-1",
      errorCode: null,
    });

    await processVideoPollJob("job1", p);

    expect(mocks.capture).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.downloadVideo).not.toHaveBeenCalled();
  });

  it("stores a completed video before capturing reserved credits", async () => {
    const p = provider();
    vi.mocked(p.getJob).mockResolvedValue({
      status: "succeeded",
      providerRequestId: "video-request-1",
      outputUrls: ["https://cdn.bytepluscdn.com/video.mp4"],
      rawUsage: { completion_tokens: 183_104, ignored: "provider-data" },
    });
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      ...base,
      status: "PROCESSING",
      providerRequestId: "video-request-1",
      errorCode: null,
    });
    const tx = transaction();

    await processVideoPollJob("job1", p);

    expect(mocks.storeVideo).toHaveBeenCalledWith(
      "job1.mp4",
      Buffer.from("mp4"),
    );
    expect(mocks.storeVideo.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.capture.mock.invocationCallOrder[0]!,
    );
    expect(mocks.capture).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ amountCredits: 28n }),
    );
    expect(tx.asset.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { objectKey: "job1.mp4" } }),
    );
    expect(tx.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actualUnits: 1,
          outputPayload: {
            stored: true,
            providerUsage: { completionTokens: 183_104 },
          },
        }),
      }),
    );
  });

  it("does not persist an invalid video token count as billing evidence", async () => {
    const p = provider();
    vi.mocked(p.getJob).mockResolvedValue({
      status: "succeeded",
      providerRequestId: "video-request-1",
      outputUrls: ["https://cdn.bytepluscdn.com/video.mp4"],
      rawUsage: { completion_tokens: -10 },
    });
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      ...base,
      status: "PROCESSING",
      providerRequestId: "video-request-1",
    });
    const tx = transaction();

    await processVideoPollJob("job1", p);

    expect(tx.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          outputPayload: { stored: true },
        }),
      }),
    );
  });

  it("settles a reference video using provider tokens and refunds the unused reservation", async () => {
    const p = provider();
    vi.mocked(p.getJob).mockResolvedValue({
      status: "succeeded",
      providerRequestId: "video-reference-1",
      outputUrls: ["https://cdn.bytepluscdn.com/video.mp4"],
      rawUsage: { completion_tokens: 183_104 },
    });
    const referenceJob = {
      ...base,
      requestPayload: {
        prompt: "test",
        referenceVideoAssetId: "source1",
        resolution: "720p",
      },
      reservedCredits: 4_000n,
      priceVersion: {
        providerCostMicroUsd: 54_000n,
        videoInputRate720p: 6_400n,
        videoInputRate1080p: 7_000n,
        fxBaisaNumerator: 769n,
        fxBaisaDenominator: 2n,
        targetMarginBps: 2_500,
        creditsPerBaisa: 1n,
      },
    };
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      ...referenceJob,
      status: "PROCESSING",
      providerRequestId: "video-reference-1",
    });
    const tx = transaction("PROCESSING", referenceJob);
    await processVideoPollJob("job1", p);
    expect(mocks.capture).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        amountCredits: expect.any(BigInt),
        metadata: { completionTokens: 183_104, cappedAtReservation: false },
      }),
    );
    expect(mocks.capture.mock.calls[0]?.[1].amountCredits).toBeLessThan(4_000n);
    expect(tx.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actualProviderCostMicroUsd: 1_171_866n,
        }),
      }),
    );
  });

  it("holds a completed reference video for review when provider usage is absent", async () => {
    const p = provider();
    vi.mocked(p.getJob).mockResolvedValue({
      status: "succeeded",
      providerRequestId: "video-reference-1",
      outputUrls: ["https://cdn.bytepluscdn.com/video.mp4"],
    });
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      ...base,
      status: "PROCESSING",
      providerRequestId: "video-reference-1",
      requestPayload: { prompt: "test", referenceVideoAssetId: "source1" },
    });
    await processVideoPollJob("job1", p);
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(mocks.downloadVideo).not.toHaveBeenCalled();
    expect(mocks.db.generationJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "MANUAL_REVIEW",
          errorCode: "MISSING_PROVIDER_USAGE",
        }),
      }),
    );
  });

  it("never captures more than the disclosed video reservation on a provider overrun", async () => {
    const p = provider();
    vi.mocked(p.getJob).mockResolvedValue({
      status: "succeeded",
      providerRequestId: "video-reference-1",
      outputUrls: ["https://cdn.bytepluscdn.com/video.mp4"],
      rawUsage: { completion_tokens: 9_000_000 },
    });
    const referenceJob = {
      ...base,
      requestPayload: {
        prompt: "test",
        referenceVideoAssetId: "source1",
        resolution: "720p",
      },
      reservedCredits: 4_000n,
      priceVersion: {
        videoInputRate720p: 6_400n,
        videoInputRate1080p: 7_000n,
        fxBaisaNumerator: 769n,
        fxBaisaDenominator: 2n,
        targetMarginBps: 2_500,
        creditsPerBaisa: 1n,
      },
    };
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      ...referenceJob,
      status: "PROCESSING",
      providerRequestId: "video-reference-1",
    });
    const tx = transaction("PROCESSING", referenceJob);
    await processVideoPollJob("job1", p);
    expect(mocks.capture).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        amountCredits: 4_000n,
        metadata: { completionTokens: 9_000_000, cappedAtReservation: true },
      }),
    );
  });
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
        outputPayload: {
          requestedCount: 1,
          outputs: [
            { index: 0, url: "https://example.bytepluscdn.com/image.png" },
          ],
        },
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
  it("saves Seedream 4.5 output as its reserved JPEG asset", async () => {
    const p = provider();
    mocks.db.asset.findMany.mockResolvedValue([
      {
        id: "asset1",
        generationOutputIndex: 0,
        objectKey: "job1.jpg",
        mimeType: "image/jpeg",
        byteSize: 25_000_000n,
        status: "PENDING",
        sourceType: "GENERATED",
        mediaKind: "IMAGE",
      },
    ]);
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      ...base,
      status: "PROCESSING",
      outputPayload: {
        requestedCount: 1,
        outputs: [{ index: 0, url: "https://cdn.bytepluscdn.com/output.jpeg" }],
      },
    });
    const tx = transaction();
    await processImageJob("job1", p);
    expect(mocks.download).toHaveBeenCalledWith(
      "https://cdn.bytepluscdn.com/output.jpeg",
      "jpeg",
    );
    expect(mocks.store).toHaveBeenCalledWith("job1.jpg", expect.any(Buffer));
    expect(tx.asset.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "asset1" } }),
    );
    expect(mocks.capture).toHaveBeenCalledTimes(1);
  });
  it("settles only successful outputs and releases unused storage capacity", async () => {
    const p = provider();
    vi.mocked(p.submit).mockResolvedValue({
      status: "succeeded",
      providerRequestId: "request-multi",
      outputUrls: [
        "https://cdn.bytepluscdn.com/image-1.png",
        "https://cdn.bytepluscdn.com/image-2.png",
      ],
    });
    const multiBase = {
      ...base,
      requestPayload: { prompt: "related set", outputCount: 3 },
      quotedUnits: 3,
      reservedCredits: 84n,
    };
    mocks.db.generationJob.findUniqueOrThrow
      .mockResolvedValueOnce({ ...multiBase, status: "QUEUED" })
      .mockResolvedValueOnce({
        ...multiBase,
        status: "PROCESSING",
        outputPayload: {
          requestedCount: 3,
          outputs: [
            { index: 0, url: "https://cdn.bytepluscdn.com/image-1.png" },
            { index: 1, url: "https://cdn.bytepluscdn.com/image-2.png" },
          ],
        },
      });
    const slots = [0, 1, 2].map((generationOutputIndex) => ({
      id: `asset${generationOutputIndex + 1}`,
      generationOutputIndex,
      objectKey: `job1-${generationOutputIndex + 1}.png`,
      mimeType: "image/png",
      byteSize: 25_000_000n,
      status: "PENDING",
      sourceType: "GENERATED",
      mediaKind: "IMAGE",
    }));
    mocks.db.asset.findMany.mockResolvedValue(slots);
    const tx = transaction("PROCESSING", multiBase);
    tx.asset.findMany.mockResolvedValue([
      { ...slots[0], status: "READY", byteSize: 100n },
      { ...slots[1], status: "READY", byteSize: 100n },
      slots[2],
    ]);

    await processImageJob("job1", p);

    expect(mocks.store).toHaveBeenCalledTimes(2);
    expect(mocks.capture).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        amountCredits: 56n,
        metadata: expect.objectContaining({
          quotedOutputs: 3,
          successfulOutputs: 2,
          unusedOutputs: 1,
        }),
      }),
    );
    expect(mocks.releaseAssetStorage).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        organizationId: "org1",
        reservedBytes: 25_000_000n,
      }),
    );
    expect(tx.asset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["asset3"] } },
        data: expect.objectContaining({ status: "DELETED", byteSize: 0n }),
      }),
    );
    expect(tx.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SUCCEEDED",
          actualUnits: 2,
          billableQuantity: 2,
          actualProviderCostMicroUsd: 108_000n,
          outputPayload: expect.objectContaining({
            successfulCount: 2,
            partialSuccess: true,
          }),
        }),
      }),
    );
  });

  it("does not resurrect a cancelled image job after the provider responds", async () => {
    const p = provider();
    vi.mocked(p.submit).mockResolvedValue({
      status: "succeeded",
      providerRequestId: "request-after-cancel",
      outputUrls: ["https://cdn.bytepluscdn.com/image.png"],
    });
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      ...base,
      status: "QUEUED",
    });
    mocks.db.generationJob.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await processImageJob("job1", p);

    expect(p.submit).toHaveBeenCalledTimes(1);
    expect(mocks.db.generationJob.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "job1", status: "SUBMITTED" },
        data: expect.objectContaining({
          status: "PROCESSING",
          providerRequestId: "request-after-cancel",
        }),
      }),
    );
    expect(mocks.store).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
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
  it("releases the reservation when the worker has no image provider credentials", async () => {
    const p = provider();
    vi.mocked(p.submit).mockRejectedValue(
      new ProviderConfigurationError("Missing credentials"),
    );
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      ...base,
      status: "QUEUED",
    });
    transaction("SUBMITTED");
    await processImageJob("job1", p);
    expect(mocks.release).toHaveBeenCalledTimes(1);
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
      outputPayload: {
        requestedCount: 1,
        outputs: [{ index: 0, url: "https://cdn.bytepluscdn.com/retry.png" }],
      },
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

describe("voice processing", () => {
  const voiceBase = {
    ...base,
    requestPayload: {
      text: "Hello world",
      voiceKey: "jasper",
      speaker: "en_male_excited-male-voice_uranus_bigtts",
      speechRate: 1.0,
      format: "mp3",
    },
    providerModel: { providerModelId: "seed-tts-2.0" },
    priceVersion: { providerCostMicroUsd: 30_000n, unitQuantity: 1000 },
    quotedUnits: 1,
    billableQuantity: 11,
    reservedCredits: 2n,
  };

  it("submits voice synthesis, stores audio, and captures reserved credits", async () => {
    const p = provider();
    const audioBytes = Buffer.from("simulated-mp3-audio");
    vi.mocked(p.submit).mockResolvedValue({
      status: "succeeded",
      providerRequestId: "speech-req-1",
      inlineOutputs: [
        {
          mediaType: "audio/mpeg",
          dataBase64: audioBytes.toString("base64"),
        },
      ],
    });
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      ...voiceBase,
      status: "QUEUED",
    });
    const tx = transaction("PROCESSING", voiceBase);

    await processVoiceJob("job1", p);

    expect(p.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaKind: "voice",
        modelId: "seed-tts-2.0",
      }),
    );
    expect(mocks.storeAudio).toHaveBeenCalledWith("job1.mp3", audioBytes);
    expect(mocks.storeAudio.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.capture.mock.invocationCallOrder[0]!,
    );
    expect(mocks.capture).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ amountCredits: 2n }),
    );
    expect(tx.asset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { objectKey: "job1.mp3" },
        data: expect.objectContaining({ status: "READY" }),
      }),
    );
    expect(tx.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SUCCEEDED",
        }),
      }),
    );
    expect(mocks.db.generationJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job1", status: "SUBMITTED" },
        data: expect.objectContaining({
          status: "PROCESSING",
          providerRequestId: "speech-req-1",
        }),
      }),
    );
  });

  it("releases credits on definite non-retryable provider rejection", async () => {
    const p = provider();
    vi.mocked(p.submit).mockRejectedValue(
      new ProviderRequestError("Rejected speech", false),
    );
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      ...voiceBase,
      status: "QUEUED",
    });
    const tx = transaction("SUBMITTED");

    await processVoiceJob("job1", p);

    expect(mocks.release).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        jobId: "job1",
        reason: "Provider rejected the voice request. Credits released.",
      }),
    );
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(tx.asset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { generationJobId: "job1", status: "PENDING" },
        data: expect.objectContaining({
          status: "DELETED",
          byteSize: 0n,
          deletedAt: expect.any(Date),
          purgeAfter: expect.any(Date),
        }),
      }),
    );
  });

  it("retains credits and marks MANUAL_REVIEW on retryable network or provider failure", async () => {
    const p = provider();
    vi.mocked(p.submit).mockRejectedValue(
      new ProviderRequestError("Network timeout", true),
    );
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      ...voiceBase,
      status: "QUEUED",
    });

    await processVoiceJob("job1", p);

    expect(mocks.db.generationJob.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "job1", status: "SUBMITTED" },
        data: expect.objectContaining({
          status: "MANUAL_REVIEW",
          errorCode: "PROVIDER_OUTCOME_UNKNOWN",
        }),
      }),
    );
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("retries storage and marks MANUAL_REVIEW if storage fails after retries", async () => {
    const p = provider();
    const audioBytes = Buffer.from("simulated-mp3-audio");
    vi.mocked(p.submit).mockResolvedValue({
      status: "succeeded",
      providerRequestId: "speech-req-1",
      inlineOutputs: [
        {
          mediaType: "audio/mpeg",
          dataBase64: audioBytes.toString("base64"),
        },
      ],
    });
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      ...voiceBase,
      status: "QUEUED",
    });
    mocks.storeAudio.mockRejectedValue(new Error("disk write error"));

    await expect(processVoiceJob("job1", p)).rejects.toThrow(
      "disk write error",
    );

    // Retried 3 times internally
    expect(mocks.storeAudio).toHaveBeenCalledTimes(3);
    expect(mocks.db.generationJob.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "job1", status: "SUBMITTED" },
        data: expect.objectContaining({
          status: "MANUAL_REVIEW",
          errorCode: "STORAGE_WRITE_FAILED",
        }),
      }),
    );
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("does not replay jobs that are not QUEUED", async () => {
    const p = provider();
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      ...voiceBase,
      status: "SUCCEEDED",
    });

    await processVoiceJob("job1", p);

    expect(p.submit).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("finalizes already-stored audio without resubmitting to BytePlus", async () => {
    const p = provider();
    const sha256 = "a".repeat(64);
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      ...voiceBase,
      status: "PROCESSING",
      outputPayload: { stored: true, byteSize: 300, sha256 },
      priceVersion: { providerCostMicroUsd: 30_000n, unitQuantity: 1000 },
    });
    const tx = transaction("PROCESSING", voiceBase);

    await processVoiceJob("job1", p);

    expect(p.submit).not.toHaveBeenCalled();
    expect(mocks.storedAssetSize).toHaveBeenCalledWith("job1.mp3");
    expect(mocks.capture).toHaveBeenCalled();
    expect(tx.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SUCCEEDED",
          actualProviderCostMicroUsd: 330n,
        }),
      }),
    );
  });
});

describe("model disabling emergency stop and pause semantics", () => {
  it("pauses a queued video job without submitting when model is disabled", async () => {
    const p = provider();
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      ...base,
      status: "QUEUED",
      providerModel: { providerModelId: "seedance-2.5", enabled: false },
    });

    await processVideoSubmitJob("job1", p);

    expect(p.submit).not.toHaveBeenCalled();
    expect(mocks.db.generationJob.updateMany).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("rolls back video submission to QUEUED if model is disabled immediately before submission", async () => {
    const p = provider();
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      ...base,
      status: "QUEUED",
      providerModel: {
        id: "m1",
        providerModelId: "seedance-2.5",
        enabled: true,
      },
    });
    mocks.db.providerModel.findUnique.mockResolvedValue({ enabled: false });

    await processVideoSubmitJob("job1", p);

    expect(p.submit).not.toHaveBeenCalled();
    expect(mocks.db.generationJob.updateMany).toHaveBeenCalledWith({
      where: { id: "job1", status: "SUBMITTED" },
      data: { status: "QUEUED", submittedAt: null },
    });
  });

  it("pauses a queued image job without submitting when model is disabled", async () => {
    const p = provider();
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      ...base,
      status: "QUEUED",
      providerModel: { providerModelId: "seedream-5-0", enabled: false },
    });

    await processImageJob("job1", p);

    expect(p.submit).not.toHaveBeenCalled();
    expect(mocks.db.generationJob.updateMany).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("fails closed and requeues if the model disappears before submission", async () => {
    const p = provider();
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      ...base,
      status: "QUEUED",
      providerModel: {
        id: "m1",
        providerModelId: "seedream-5-0",
        enabled: true,
      },
    });
    mocks.db.providerModel.findUnique.mockResolvedValue(null);

    await processImageJob("job1", p);

    expect(p.submit).not.toHaveBeenCalled();
    expect(mocks.db.generationJob.updateMany).toHaveBeenCalledWith({
      where: { id: "job1", status: "SUBMITTED" },
      data: { status: "QUEUED", submittedAt: null },
    });
  });

  it("rolls back image submission to QUEUED if model is disabled immediately before submission", async () => {
    const p = provider();
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      ...base,
      status: "QUEUED",
      providerModel: {
        id: "m1",
        providerModelId: "seedream-5-0",
        enabled: true,
      },
    });
    mocks.db.providerModel.findUnique.mockResolvedValue({ enabled: false });

    await processImageJob("job1", p);

    expect(p.submit).not.toHaveBeenCalled();
    expect(mocks.db.generationJob.updateMany).toHaveBeenCalledWith({
      where: { id: "job1", status: "SUBMITTED" },
      data: { status: "QUEUED", submittedAt: null },
    });
  });

  it("pauses a queued voice job without submitting when model is disabled", async () => {
    const p = provider();
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      id: "job1",
      organizationId: "org1",
      createdById: "user1",
      idempotencyKey: "key1",
      requestPayload: { prompt: "voice" },
      reservedCredits: 28n,
      status: "QUEUED",
      providerModel: { providerModelId: "seed-tts-2.0", enabled: false },
      priceVersion: { providerCostMicroUsd: 10_000n },
    });

    await processVoiceJob("job1", p);

    expect(p.submit).not.toHaveBeenCalled();
    expect(mocks.db.generationJob.updateMany).not.toHaveBeenCalled();
  });

  it("rolls back voice submission to QUEUED if model is disabled immediately before submission", async () => {
    const p = provider();
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
      id: "job1",
      organizationId: "org1",
      createdById: "user1",
      idempotencyKey: "key1",
      requestPayload: { prompt: "voice" },
      reservedCredits: 28n,
      status: "QUEUED",
      providerModel: {
        id: "m1",
        providerModelId: "seed-tts-2.0",
        enabled: true,
      },
      priceVersion: { providerCostMicroUsd: 10_000n },
    });
    mocks.db.providerModel.findUnique.mockResolvedValue({ enabled: false });

    await processVoiceJob("job1", p);

    expect(p.submit).not.toHaveBeenCalled();
    expect(mocks.db.generationJob.updateMany).toHaveBeenCalledWith({
      where: { id: "job1", status: "SUBMITTED" },
      data: { status: "QUEUED", submittedAt: null },
    });
  });
});

describe("ordinary token-priced video settlement", () => {
  const tokenJob = {
    ...base,
    requestPayload: {
      durationSeconds: 5,
      resolution: "720p",
      aspectRatio: "16:9",
    },
    reservedCredits: 1000n,
    priceVersion: {
      providerCostMicroUsd: 10700n,
      pricingDimension: "TOKEN",
      fxBaisaNumerator: 769n,
      fxBaisaDenominator: 2n,
      targetMarginBps: 2500,
      creditsPerBaisa: 1n,
      usageRates: {
        estimator: "byteplus-video-v1",
        rates: [
          {
            resolution: "720p",
            workflow: "GENERATE",
            microUsdPerThousandTokens: "10700",
          },
        ],
      },
    },
  };
  it.each([108000, 500000])(
    "captures measured usage %i under the disclosed ceiling",
    async (tokens) => {
      const p = provider();
      vi.mocked(p.getJob).mockResolvedValue({
        status: "succeeded",
        providerRequestId: "token-video",
        outputUrls: ["https://provider.invalid/video.mp4"],
        rawUsage: { completion_tokens: tokens },
      });
      mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
        ...tokenJob,
        status: "PROCESSING",
        providerRequestId: "token-video",
      });
      const tx = transaction("PROCESSING", tokenJob);
      await processVideoPollJob("job1", p);
      expect(mocks.capture).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          amountCredits: tokens === 108000 ? 594n : 1000n,
          metadata: {
            completionTokens: tokens,
            cappedAtReservation: tokens !== 108000,
          },
        }),
      );
      expect(tx.generationJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actualProviderCostMicroUsd: tokens === 108000 ? 1155600n : 5350000n,
            providerCostBasis: "PROVIDER_USAGE",
            actualUnits: tokens,
          }),
        }),
      );
    },
  );
  it.each([undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "holds for review when provider usage is invalid (%s)",
    async (tokens) => {
      const p = provider();
      vi.mocked(p.getJob).mockResolvedValue({
        status: "succeeded",
        providerRequestId: "token-video",
        outputUrls: ["https://provider.invalid/video.mp4"],
        rawUsage: { completion_tokens: tokens },
      });
      mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue({
        ...tokenJob,
        status: "PROCESSING",
        providerRequestId: "token-video",
      });
      await processVideoPollJob("job1", p);
      expect(mocks.capture).not.toHaveBeenCalled();
      expect(mocks.release).not.toHaveBeenCalled();
      expect(mocks.db.generationJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "MANUAL_REVIEW",
            errorCode: "MISSING_PROVIDER_USAGE",
          }),
        }),
      );
    },
  );
});
