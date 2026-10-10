import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import type { ReasoningProvider } from "@aiwa/providers";

const mocks = vi.hoisted(() => ({
  db: {
    reasoningJob: {
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
    providerModel: {
      findUnique: vi.fn(),
    },
    auditEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  requireMembership: vi.fn(),
  settleReasoningProviderCost: vi.fn(),
}));

vi.mock("@aiwa/db", () => ({
  db: mocks.db,
}));

vi.mock("@aiwa/generation", () => ({
  requireMembership: mocks.requireMembership,
}));

vi.mock("@aiwa/credits", () => ({
  settleReasoningProviderCost: mocks.settleReasoningProviderCost,
}));

import { processReasoningJob } from "../src/reasoning";

function queueJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "reason-job-1",
    data: { jobId: "reason-job-1" },
    opts: { attempts: 2 },
    attemptsMade: 0,
    ...overrides,
  } as unknown as Job;
}

function dbJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "reason-job-1",
    organizationId: "org-1",
    createdById: "user-1",
    providerModelId: "canonical-model-1",
    priceVersionId: "price-1",
    idempotencyKey: "reasoning:user-1:request-1",
    status: "QUEUED",
    processingAt: null,
    requestPayload: {
      task: "prompt-enhancement",
      systemPrompt: "Enhance safely.",
      userPrompt: "desert sunrise",
      responseSchemaName: "prompt-enhancement-v1",
    },
    providerModel: {
      id: "canonical-model-1",
      provider: "GROQ",
      providerModelId: "openai/gpt-oss-120b",
      enabled: true,
    },
    priceVersion: {
      id: "price-1",
      providerModelId: "canonical-model-1",
      providerCostMicroUsd: 2000n,
      pricingDimension: "TOKEN",
      usageRates: {
        estimator: "text-token-v1",
        tiers: [
          {
            maxPromptTokens: 131072,
            inputMicroUsdPerMillionTokens: "1000000",
            outputMicroUsdPerMillionTokens: "2000000",
          },
        ],
      },
    },
    ...overrides,
  };
}

function settlementTx() {
  return {
    reasoningJob: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    auditEvent: {
      create: vi.fn().mockResolvedValue({ id: "audit-1" }),
    },
  };
}

describe("multi-provider reasoning worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMembership.mockResolvedValue({
      role: "ORGANIZATION_MEMBER",
    });
    mocks.db.reasoningJob.findUniqueOrThrow.mockResolvedValue(dbJob());
    mocks.db.reasoningJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.db.providerModel.findUnique.mockResolvedValue({ enabled: true });
    mocks.db.auditEvent.create.mockResolvedValue({ id: "audit-failed" });
    mocks.settleReasoningProviderCost.mockReturnValue({
      providerCostMicroUsd: 321n,
      basis: "PROVIDER_USAGE",
    });
  });

  it("executes only the provider/model pinned to the reasoning job and persists cost", async () => {
    const tx = settlementTx();
    mocks.db.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx),
    );
    const groq: ReasoningProvider = {
      name: "groq",
      complete: vi.fn().mockResolvedValue({
        providerRequestId: "groq-request-1",
        content: { enhancedPrompt: "Cinematic desert sunrise" },
        inputTokens: 100,
        outputTokens: 50,
      }),
    };

    await processReasoningJob(queueJob(), { GROQ: groq });

    expect(groq.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "openai/gpt-oss-120b",
        idempotencyKey: "reasoning:user-1:request-1",
      }),
    );
    expect(mocks.settleReasoningProviderCost).toHaveBeenCalledWith({
      price: expect.objectContaining({ id: "price-1" }),
      inputTokens: 100,
      outputTokens: 50,
    });
    expect(tx.reasoningJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "reason-job-1", status: "PROCESSING" },
        data: expect.objectContaining({
          status: "SUCCEEDED",
          providerRequestId: "groq-request-1",
          inputTokens: 100,
          outputTokens: 50,
          actualProviderCostMicroUsd: 321n,
          providerCostBasis: "PROVIDER_USAGE",
        }),
      }),
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "reasoning.succeeded",
          metadata: expect.objectContaining({
            provider: "GROQ",
            providerModelId: "openai/gpt-oss-120b",
            priceVersionId: "price-1",
            actualProviderCostMicroUsd: "321",
          }),
        }),
      }),
    );
  });

  it("processes speech as VOICE with a larger output budget", async () => {
    const tx = settlementTx();
    mocks.db.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx),
    );
    mocks.db.reasoningJob.findUniqueOrThrow.mockResolvedValue(
      dbJob({
        requestPayload: {
          task: "prompt-enhancement",
          systemPrompt: "Return speakable narration.",
          userPrompt: "Please announce the event warmly.",
          targetMedia: "VOICE",
          responseSchemaName: "prompt-enhancement-v1",
        },
      }),
    );
    const provider: ReasoningProvider = {
      name: "groq",
      complete: vi.fn().mockResolvedValue({
        providerRequestId: "voice-enhance-1",
        content: { enhancedPrompt: "Welcome to our event." },
      }),
    };
    await processReasoningJob(queueJob(), { GROQ: provider });
    expect(provider.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTokens: 4096,
        userPrompt: "Please announce the event warmly.",
      }),
    );
    expect(tx.reasoningJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SUCCEEDED",
          outputPayload: { enhancedPrompt: "Welcome to our event." },
        }),
      }),
    );
  });

  it("rejects speech output longer than the speech editor and fails the job", async () => {
    mocks.db.reasoningJob.findUniqueOrThrow.mockResolvedValue(
      dbJob({
        requestPayload: {
          task: "prompt-enhancement",
          systemPrompt: "Enhance.",
          userPrompt: "Hello",
          targetMedia: "VOICE",
          responseSchemaName: "prompt-enhancement-v1",
        },
      }),
    );
    const provider: ReasoningProvider = {
      name: "groq",
      complete: vi
        .fn()
        .mockResolvedValue({ content: { enhancedPrompt: "a".repeat(4097) } }),
    };
    await expect(
      processReasoningJob(queueJob(), { GROQ: provider }),
    ).rejects.toThrow();
    expect(mocks.db.reasoningJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
  });

  it("fails a pinned job instead of switching providers when its model is disabled", async () => {
    mocks.db.reasoningJob.findUniqueOrThrow.mockResolvedValue(
      dbJob({
        providerModel: {
          id: "canonical-model-1",
          provider: "GROQ",
          providerModelId: "openai/gpt-oss-120b",
          enabled: false,
        },
      }),
    );
    const groq: ReasoningProvider = {
      name: "groq",
      complete: vi.fn(),
    };

    await processReasoningJob(queueJob(), { GROQ: groq });

    expect(groq.complete).not.toHaveBeenCalled();
    expect(mocks.db.reasoningJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "reason-job-1",
          status: { in: ["QUEUED", "PROCESSING"] },
        },
        data: expect.objectContaining({
          status: "FAILED",
          errorCode: "MODEL_DISABLED",
        }),
      }),
    );
  });

  it("keeps successful output even when provider token cost cannot be observed", async () => {
    const tx = settlementTx();
    mocks.db.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx),
    );
    mocks.settleReasoningProviderCost.mockImplementation(() => {
      throw new Error("usage outside pricing tiers");
    });
    const gemini: ReasoningProvider = {
      name: "gemini",
      complete: vi.fn().mockResolvedValue({
        providerRequestId: "gemini-request-1",
        content: { enhancedPrompt: "Refined prompt" },
      }),
    };
    mocks.db.reasoningJob.findUniqueOrThrow.mockResolvedValue(
      dbJob({
        providerModel: {
          id: "canonical-model-2",
          provider: "GEMINI",
          providerModelId: "gemini-3.8-flash",
          enabled: true,
        },
        providerModelId: "canonical-model-2",
      }),
    );

    await processReasoningJob(queueJob(), { GEMINI: gemini });

    expect(tx.reasoningJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SUCCEEDED",
          providerCostBasis: "USAGE_UNAVAILABLE",
        }),
      }),
    );
  });
});
