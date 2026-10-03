import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  admitReasoningJob,
  ReasoningAdmissionError,
  ReasoningAdmissionLimitError,
} from "./reasoning-admission";

describe("admitReasoningJob atomic admission limits and provenance", () => {
  const fakeTx = {
    $queryRaw: vi.fn(),
    membership: {
      findUnique: vi.fn(),
    },
    providerModel: {
      findUnique: vi.fn(),
    },
    modelPriceVersion: {
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
    priceVersionId: "price-1",
    idempotencyKey: "reasoning:user-1:uuid-1",
    userPrompt: "Enhance this",
    targetMedia: "IMAGE" as const,
    systemPrompt: "System instruction",
  };

  const txClient = fakeTx as unknown as Parameters<typeof admitReasoningJob>[1];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GROQ_API_KEY", "gsk-test");
    fakeTx.$queryRaw.mockResolvedValue([{ id: "membership-1" }]);
    fakeTx.membership.findUnique.mockResolvedValue({
      role: "ORGANIZATION_MEMBER",
      organization: { status: "ACTIVE" },
    });
    fakeTx.providerModel.findUnique.mockResolvedValue({
      id: "model-1",
      provider: "GROQ",
      providerModelId: "openai/gpt-oss-120b",
      displayName: "GPT-OSS 120B",
      mediaKind: "TEXT",
      enabled: true,
      capabilities: {
        reasoning: true,
        "task:prompt-enhancement": true,
      },
    });
    fakeTx.modelPriceVersion.findUnique.mockResolvedValue({
      id: "price-1",
      providerModelId: "model-1",
      providerCostMicroUsd: 2500n,
      pricingDimension: "REQUEST",
      unitQuantity: 1,
      usageRates: null,
      effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      effectiveTo: null,
    });
    fakeTx.reasoningJob.findUnique.mockResolvedValue(null);
    fakeTx.reasoningJob.count.mockResolvedValue(0);
    fakeTx.reasoningJob.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: "job-created-1", status: "QUEUED", ...data }),
    );
    fakeTx.auditEvent.create.mockResolvedValue({ id: "audit-1" });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("locks membership and pins canonical model plus price provenance", async () => {
    const result = await admitReasoningJob(sampleInput, txClient);

    expect(result.isExisting).toBe(false);
    expect(fakeTx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(fakeTx.reasoningJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerModelId: "model-1",
          priceVersionId: "price-1",
          estimatedProviderCostMicroUsd: 2500n,
          providerCostBasis: "CONFIGURED_RATE",
          status: "QUEUED",
        }),
      }),
    );
  });

  it("rejects if membership disappears before the admission lock", async () => {
    fakeTx.$queryRaw.mockResolvedValue([]);

    await expect(
      admitReasoningJob(sampleInput, txClient),
    ).rejects.toMatchObject({
      status: 403,
      message: "Access denied.",
    });
    expect(fakeTx.reasoningJob.create).not.toHaveBeenCalled();
  });

  it("revalidates generation permission after locking membership", async () => {
    fakeTx.membership.findUnique.mockResolvedValue({
      role: "ORGANIZATION_VIEWER",
      organization: { status: "ACTIVE" },
    });

    await expect(
      admitReasoningJob(sampleInput, txClient),
    ).rejects.toBeInstanceOf(ReasoningAdmissionError);
    expect(fakeTx.providerModel.findUnique).not.toHaveBeenCalled();
  });

  it("fails closed when the selected provider runtime is no longer configured", async () => {
    vi.unstubAllEnvs();

    await expect(
      admitReasoningJob(sampleInput, txClient),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("unavailable"),
    });
    expect(fakeTx.reasoningJob.create).not.toHaveBeenCalled();
  });

  it("fails closed when the model is disabled or loses task capability", async () => {
    fakeTx.providerModel.findUnique.mockResolvedValue({
      id: "model-1",
      provider: "GROQ",
      providerModelId: "openai/gpt-oss-120b",
      displayName: "GPT-OSS 120B",
      mediaKind: "TEXT",
      enabled: false,
      capabilities: { "task:prompt-enhancement": true },
    });

    await expect(
      admitReasoningJob(sampleInput, txClient),
    ).rejects.toMatchObject({ status: 409 });
    expect(fakeTx.modelPriceVersion.findUnique).not.toHaveBeenCalled();
  });

  it("requires the selected immutable price to still be active for that model", async () => {
    fakeTx.modelPriceVersion.findUnique.mockResolvedValue({
      id: "price-1",
      providerModelId: "another-model",
      providerCostMicroUsd: 2500n,
      pricingDimension: "REQUEST",
      unitQuantity: 1,
      usageRates: null,
      effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      effectiveTo: null,
    });

    await expect(
      admitReasoningJob(sampleInput, txClient),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("pricing changed"),
    });
  });

  it("accepts token-priced external reasoning and records a cost estimate", async () => {
    fakeTx.modelPriceVersion.findUnique.mockResolvedValue({
      id: "price-1",
      providerModelId: "model-1",
      providerCostMicroUsd: 2000n,
      pricingDimension: "TOKEN",
      unitQuantity: 1000,
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
      effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      effectiveTo: null,
    });

    await admitReasoningJob(sampleInput, txClient);

    expect(fakeTx.reasoningJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          priceVersionId: "price-1",
          providerCostBasis: "ESTIMATED_TOKENS",
          estimatedProviderCostMicroUsd: expect.any(BigInt),
        }),
      }),
    );
  });

  it("rejects atomically when active or hourly limits are reached", async () => {
    fakeTx.reasoningJob.count
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(10);

    await expect(
      admitReasoningJob(sampleInput, txClient),
    ).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 5,
    });

    fakeTx.reasoningJob.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(60);
    await expect(
      admitReasoningJob(sampleInput, txClient),
    ).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 60,
    });
  });

  it("replays only when prompt, media, model, and pinned price agree", async () => {
    fakeTx.reasoningJob.findUnique.mockResolvedValue({
      id: "job-existing-1",
      organizationId: sampleInput.organizationId,
      providerModelId: sampleInput.providerModelId,
      priceVersionId: sampleInput.priceVersionId,
      status: "QUEUED",
      requestPayload: {
        task: "prompt-enhancement",
        userPrompt: sampleInput.userPrompt,
        targetMedia: sampleInput.targetMedia,
      },
    });

    const result = await admitReasoningJob(sampleInput, txClient);
    expect(result.isExisting).toBe(true);
    expect(fakeTx.providerModel.findUnique).not.toHaveBeenCalled();

    await expect(
      admitReasoningJob(
        { ...sampleInput, providerModelId: "different-model" },
        txClient,
      ),
    ).rejects.toBeInstanceOf(ReasoningAdmissionLimitError);
  });

  it("writes provider, model, price, and estimated cost into the audit event", async () => {
    await admitReasoningJob(sampleInput, txClient);

    expect(fakeTx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "reasoning.queued",
          targetType: "ReasoningJob",
          metadata: expect.objectContaining({
            provider: "GROQ",
            providerModelId: "openai/gpt-oss-120b",
            priceVersionId: "price-1",
            estimatedProviderCostMicroUsd: "2500",
            providerCostBasis: "CONFIGURED_RATE",
          }),
        }),
      }),
    );
  });
});
