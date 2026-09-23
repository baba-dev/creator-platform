import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  admitReasoningJob,
  ReasoningAdmissionError,
  ReasoningAdmissionLimitError,
} from "./reasoning-admission";

describe("admitReasoningJob atomic admission limits", () => {
  const fakeTx = {
    $queryRaw: vi.fn(),
    membership: {
      findUnique: vi.fn(),
    },
    reasoningJob: {
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    auditEvent: {
      create: vi.fn(),
    },
  };

  const sampleInput = {
    organizationId: "org-1",
    userId: "user-1",
    providerModelId: "model-1",
    idempotencyKey: "reasoning:user-1:uuid-1",
    userPrompt: "Enhance this",
    targetMedia: "IMAGE" as const,
    systemPrompt: "System instruction",
  };

  const txClient = fakeTx as unknown as Parameters<typeof admitReasoningJob>[1];

  beforeEach(() => {
    vi.clearAllMocks();
    fakeTx.$queryRaw.mockResolvedValue([{ id: "membership-1" }]);
    fakeTx.membership.findUnique.mockResolvedValue({
      role: "ORGANIZATION_MEMBER",
      organization: { status: "ACTIVE" },
    });
    fakeTx.reasoningJob.findUnique.mockResolvedValue(null);
    fakeTx.reasoningJob.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: "job-created-1", status: "QUEUED", ...data }),
    );
    fakeTx.auditEvent.create.mockResolvedValue({ id: "audit-1" });
  });

  it("locks the membership row to serialize admission", async () => {
    fakeTx.reasoningJob.count.mockResolvedValue(0);

    await admitReasoningJob(sampleInput, txClient);

    expect(fakeTx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(fakeTx.reasoningJob.create).toHaveBeenCalledTimes(1);
  });

  it("rejects if membership disappears before the admission lock is acquired", async () => {
    fakeTx.$queryRaw.mockResolvedValue([]);

    await expect(
      admitReasoningJob(sampleInput, txClient),
    ).rejects.toMatchObject({
      status: 403,
      message: "Access denied.",
    });

    expect(fakeTx.reasoningJob.create).not.toHaveBeenCalled();
  });

  it("revalidates generation permission after acquiring the membership lock", async () => {
    fakeTx.membership.findUnique.mockResolvedValue({
      role: "ORGANIZATION_VIEWER",
      organization: { status: "ACTIVE" },
    });

    await expect(
      admitReasoningJob(sampleInput, txClient),
    ).rejects.toBeInstanceOf(ReasoningAdmissionError);

    expect(fakeTx.reasoningJob.count).not.toHaveBeenCalled();
    expect(fakeTx.reasoningJob.create).not.toHaveBeenCalled();
  });

  it("rejects atomically when active jobs limit (3) is reached", async () => {
    // [activeJobs, recentJobs]
    fakeTx.reasoningJob.count
      .mockResolvedValueOnce(3) // activeJobs = 3
      .mockResolvedValueOnce(10); // recentJobs = 10

    await expect(admitReasoningJob(sampleInput, txClient)).rejects.toThrowError(
      ReasoningAdmissionLimitError,
    );

    try {
      fakeTx.reasoningJob.count
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(10);
      await admitReasoningJob(sampleInput, txClient);
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ReasoningAdmissionLimitError);
      const admissionErr = err as ReasoningAdmissionLimitError;
      expect(admissionErr.status).toBe(429);
      expect(admissionErr.retryAfterSeconds).toBe(5);
      expect(admissionErr.message).toContain(
        "Too many prompt enhancements are already running",
      );
    }

    expect(fakeTx.reasoningJob.create).not.toHaveBeenCalled();
  });

  it("rejects atomically when hourly limit (60) is reached", async () => {
    fakeTx.reasoningJob.count
      .mockResolvedValueOnce(1) // activeJobs = 1
      .mockResolvedValueOnce(60); // recentJobs = 60

    try {
      await admitReasoningJob(sampleInput, txClient);
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ReasoningAdmissionLimitError);
      const admissionErr = err as ReasoningAdmissionLimitError;
      expect(admissionErr.status).toBe(429);
      expect(admissionErr.retryAfterSeconds).toBe(60);
      expect(admissionErr.message).toContain(
        "Prompt enhancement hourly limit reached",
      );
    }

    expect(fakeTx.reasoningJob.create).not.toHaveBeenCalled();
  });

  it("returns existing job atomically when idempotency key already exists with same inputs", async () => {
    fakeTx.reasoningJob.findUnique.mockResolvedValue({
      id: "job-existing-1",
      organizationId: sampleInput.organizationId,
      status: "QUEUED",
      requestPayload: {
        task: "prompt-enhancement",
        userPrompt: sampleInput.userPrompt,
        targetMedia: sampleInput.targetMedia,
      },
    });

    const result = await admitReasoningJob(sampleInput, txClient);

    expect(result.isExisting).toBe(true);
    expect(result.job.id).toBe("job-existing-1");
    expect(fakeTx.reasoningJob.count).not.toHaveBeenCalled();
    expect(fakeTx.reasoningJob.create).not.toHaveBeenCalled();
  });

  it("rejects with 409 when idempotency key was used for different inputs", async () => {
    fakeTx.reasoningJob.findUnique.mockResolvedValue({
      id: "job-existing-1",
      organizationId: sampleInput.organizationId,
      status: "QUEUED",
      requestPayload: {
        task: "prompt-enhancement",
        userPrompt: "Different prompt entirely",
        targetMedia: sampleInput.targetMedia,
      },
    });

    try {
      await admitReasoningJob(sampleInput, txClient);
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ReasoningAdmissionLimitError);
      const admissionErr = err as ReasoningAdmissionLimitError;
      expect(admissionErr.status).toBe(409);
      expect(admissionErr.message).toContain(
        "Idempotency key was already used for different inputs",
      );
    }
  });

  it("creates job and audit event when within limits", async () => {
    fakeTx.reasoningJob.count
      .mockResolvedValueOnce(2) // activeJobs = 2 (< 3)
      .mockResolvedValueOnce(20); // recentJobs = 20 (< 60)

    const result = await admitReasoningJob(sampleInput, txClient);

    expect(result.isExisting).toBe(false);
    expect(result.job.id).toBe("job-created-1");
    expect(fakeTx.reasoningJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org-1",
          createdById: "user-1",
          status: "QUEUED",
        }),
      }),
    );
    expect(fakeTx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "reasoning.queued",
          targetType: "ReasoningJob",
        }),
      }),
    );
  });
});
