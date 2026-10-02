import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    generationJob: {
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@aiwa/db", () => ({ db: mocks.db }));

import { reapExpiredRecoveryJobs } from "../src/reaper";

describe("reapExpiredRecoveryJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.generationJob.updateMany.mockResolvedValue({ count: 0 });
  });

  it("uses fixed timestamps (submittedAt/createdAt) for voice recovery cutoff, not updatedAt", async () => {
    const fixedNow = new Date("2026-09-23T12:00:00.000Z");
    const expected24hCutoff = new Date("2026-09-22T12:00:00.000Z");

    await reapExpiredRecoveryJobs(fixedNow);

    // Verify 5 updateMany calls were made:
    // 1. interrupted SUBMITTED jobs
    // 2. expired IMAGE recovery
    // 3. expired VOICE recovery
    // 4. interrupted TEXT settlement
    // 5. expired VIDEO recovery
    expect(mocks.db.generationJob.updateMany).toHaveBeenCalledTimes(5);

    // Call 3: Voice recovery cutoff
    const voiceCall = mocks.db.generationJob.updateMany.mock.calls[2]?.[0];
    expect(voiceCall).toBeDefined();
    expect(voiceCall.where).toEqual({
      status: "PROCESSING",
      providerModel: { mediaKind: "VOICE" },
      OR: [
        {
          submittedAt: {
            lt: expected24hCutoff,
          },
        },
        {
          submittedAt: null,
          createdAt: { lt: expected24hCutoff },
        },
      ],
    });
    expect(voiceCall.data).toEqual({
      status: "MANUAL_REVIEW",
      errorCode: "STORAGE_FAILED",
      errorMessage:
        "Audio finalization exceeded the recovery window. Credits remain reserved for review.",
    });

    // Make sure updatedAt is NOT in where clause for voice
    expect(voiceCall.where).not.toHaveProperty("updatedAt");
  });

  it("uses fixed timestamps (submittedAt/createdAt) for image recovery cutoff, not updatedAt", async () => {
    const fixedNow = new Date("2026-09-23T12:00:00.000Z");
    const expected24hCutoff = new Date("2026-09-22T12:00:00.000Z");

    await reapExpiredRecoveryJobs(fixedNow);

    // Call 2: Image recovery cutoff
    const imageCall = mocks.db.generationJob.updateMany.mock.calls[1]?.[0];
    expect(imageCall).toBeDefined();
    expect(imageCall.where).toEqual({
      status: "PROCESSING",
      providerModel: { mediaKind: "IMAGE" },
      OR: [
        {
          submittedAt: {
            lt: expected24hCutoff,
          },
        },
        {
          submittedAt: null,
          createdAt: { lt: expected24hCutoff },
        },
      ],
    });
    expect(imageCall.data).toEqual({
      status: "MANUAL_REVIEW",
      errorCode: "STORAGE_FAILED",
      errorMessage:
        "Image could not be stored. Credits remain reserved for review.",
    });
    expect(imageCall.where).not.toHaveProperty("updatedAt");
  });

  it("moves stale text settlement into manual review without replaying the provider", async () => {
    const fixedNow = new Date("2026-09-23T12:00:00.000Z");
    const expected15mCutoff = new Date("2026-09-23T11:45:00.000Z");

    await reapExpiredRecoveryJobs(fixedNow);

    const textCall = mocks.db.generationJob.updateMany.mock.calls[3]?.[0];
    expect(textCall.where).toEqual({
      status: "PROCESSING",
      providerModel: { mediaKind: "TEXT" },
      updatedAt: { lt: expected15mCutoff },
    });
    expect(textCall.data).toEqual({
      status: "MANUAL_REVIEW",
      errorCode: "TEXT_SETTLEMENT_INTERRUPTED",
      errorMessage:
        "Text generation completed or reached settlement, but the worker was interrupted. Credits remain reserved for review.",
    });
  });

  it("reaps video recovery and interrupted submissions", async () => {
    const fixedNow = new Date("2026-09-23T12:00:00.000Z");
    const expected15mCutoff = new Date("2026-09-23T11:45:00.000Z");
    const expected2hCutoff = new Date("2026-09-23T10:00:00.000Z");

    await reapExpiredRecoveryJobs(fixedNow);

    // Call 1: Interrupted submissions
    const interruptedCall =
      mocks.db.generationJob.updateMany.mock.calls[0]?.[0];
    expect(interruptedCall.where).toEqual({
      status: "SUBMITTED",
      submittedAt: { lt: expected15mCutoff },
    });
    expect(interruptedCall.data.errorCode).toBe("WORKER_INTERRUPTED");

    // Call 5: Video timeout
    const videoCall = mocks.db.generationJob.updateMany.mock.calls[4]?.[0];
    expect(videoCall.where).toEqual({
      status: "PROCESSING",
      providerModel: { mediaKind: "VIDEO" },
      submittedAt: { lt: expected2hCutoff },
    });
    expect(videoCall.data.errorCode).toBe("PROVIDER_TIMEOUT");
  });
});
