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
  downloadVideo: vi.fn(),
  storeVideo: vi.fn(),
  storeAudio: vi.fn(),
  storedAssetSize: vi.fn(),
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
  mocks.downloadVideo.mockResolvedValue(Buffer.from("mp4"));
  mocks.storeVideo.mockResolvedValue({ byteSize: 200n, sha256: "video-hash" });
  mocks.storeAudio.mockResolvedValue({ byteSize: 300n, sha256: "audio-hash" });
  mocks.storedAssetSize.mockResolvedValue(300);
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
    priceVersion: { providerCostMicroUsd: 30_000n },
    quotedUnits: 1,
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
        data: { status: "DELETED", byteSize: 0n },
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
      priceVersion: { providerCostMicroUsd: 30_000n },
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
          actualProviderCostMicroUsd: 30_000n,
        }),
      }),
    );
  });
});
