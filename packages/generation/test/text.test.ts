import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn(),
  },
  credits: {
    calculateBillableUnits: vi.fn(
      (tokens: bigint, unit: bigint) => (tokens + unit - 1n) / unit,
    ),
    estimateGeneration: vi.fn(),
    createCreditQuote: vi.fn(() => ({ customerCredits: 5n })),
    priceCredits: vi.fn(() => 5n),
    reserveCreditsForJob: vi.fn(),
    captureCreditsForJob: vi.fn(),
    releaseOrRefundCredits: vi.fn(),
  },
  quoteContract: {
    verifyGenerationQuote: vi.fn(),
    quoteParameters: vi.fn(),
  },
}));

vi.mock("@aiwa/db", () => ({ db: mocks.db }));
vi.mock("@aiwa/credits", () => mocks.credits);

import { executeTextGeneration } from "../src/text";

describe("executeTextGeneration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("validates input and throws error on malformed request", async () => {
    await expect(
      executeTextGeneration("user_1", {
        organizationId: "org_1",
        modelId: "m_1",
        priceVersionId: "pv_1",
        idempotencyKey: "invalid-uuid",
        messages: [],
      }),
    ).rejects.toThrow();
  });

  it("successfully reserves credits, calls provider, captures credits, and returns result", async () => {
    const tx = {
      $queryRaw: vi.fn(),
      membership: {
        findUnique: vi.fn().mockResolvedValue({
          role: "ORGANIZATION_MEMBER",
          monthlySpendingCapCredits: null,
          organization: { status: "ACTIVE" },
          user: { disabledAt: null, emailVerified: true },
        }),
      },
      generationTemplate: { findFirst: vi.fn() },
      generationJob: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "job_text_1" }),
        update: vi
          .fn()
          .mockResolvedValue({ id: "job_text_1", status: "SUBMITTED" }),
        aggregate: vi.fn().mockResolvedValue({
          _sum: { chargedCredits: 0n, reservedCredits: 0n },
        }),
      },
      providerModel: {
        findFirst: vi.fn().mockResolvedValue({
          id: "m_1",
          providerModelId: "doubao-seed-character-260628",
          enabled: true,
          priceVersions: [
            {
              id: "pv_1",
              providerCostMicroUsd: 1000n,
              pricingDimension: "TOKEN",
              unitQuantity: 1000,
            },
          ],
        }),
      },
      project: { findUnique: vi.fn() },
      wallet: {
        findUnique: vi.fn().mockResolvedValue({ id: "wallet_1" }),
      },
      auditEvent: {
        create: vi.fn(),
      },
    };

    mocks.db.$transaction.mockImplementation(async (callback) => callback(tx));
    mocks.credits.estimateGeneration.mockReturnValue({
      reservation: { customerCredits: 10n },
      units: 1,
      billableQuantity: 1000,
    });

    const mockProvider = {
      name: "byteplus" as const,
      listModels: vi.fn(),
      getJob: vi.fn(),
      cancel: vi.fn(),
      submit: vi.fn().mockResolvedValue({
        providerRequestId: "req_1",
        status: "succeeded" as const,
        textOutput: { content: "Hello, traveler! What brings you here?" },
        rawUsage: {
          prompt_tokens: 50,
          completion_tokens: 120,
          total_tokens: 170,
        },
      }),
    };

    const validPayload = {
      organizationId: "org_1",
      modelId: "m_1",
      priceVersionId: "pv_1",
      idempotencyKey: "123e4567-e89b-12d3-a456-426614174000",
      messages: [{ role: "user" as const, content: "Greetings!" }],
      temperature: 0.7,
      maxTokens: 1024,
    };

    const result = await executeTextGeneration("user_1", validPayload, {
      provider: mockProvider,
    });

    expect(result.status).toBe("SUCCEEDED");
    expect(result.content).toBe("Hello, traveler! What brings you here?");
    expect(result.usage?.totalTokens).toBe(170);
    expect(mocks.credits.reserveCreditsForJob).toHaveBeenCalled();
    expect(mockProvider.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "doubao-seed-character-260628",
        mediaKind: "text",
      }),
    );
    expect(mocks.credits.captureCreditsForJob).toHaveBeenCalled();
  });

  it("releases credits if provider fails", async () => {
    const tx = {
      $queryRaw: vi.fn(),
      membership: {
        findUnique: vi.fn().mockResolvedValue({
          role: "ORGANIZATION_MEMBER",
          monthlySpendingCapCredits: null,
          organization: { status: "ACTIVE" },
          user: { disabledAt: null, emailVerified: true },
        }),
      },
      generationTemplate: { findFirst: vi.fn() },
      generationJob: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "job_text_1" }),
        update: vi
          .fn()
          .mockResolvedValue({ id: "job_text_1", status: "SUBMITTED" }),
        aggregate: vi.fn().mockResolvedValue({
          _sum: { chargedCredits: 0n, reservedCredits: 0n },
        }),
      },
      providerModel: {
        findFirst: vi.fn().mockResolvedValue({
          id: "m_1",
          providerModelId: "doubao-seed-character-260628",
          enabled: true,
          priceVersions: [
            {
              id: "pv_1",
              providerCostMicroUsd: 1000n,
              pricingDimension: "TOKEN",
              unitQuantity: 1000,
            },
          ],
        }),
      },
      project: { findUnique: vi.fn() },
      wallet: {
        findUnique: vi.fn().mockResolvedValue({ id: "wallet_1" }),
      },
      auditEvent: {
        create: vi.fn(),
      },
    };

    mocks.db.$transaction.mockImplementation(async (callback) => callback(tx));
    mocks.credits.estimateGeneration.mockReturnValue({
      reservation: { customerCredits: 10n },
      units: 1,
      billableQuantity: 1000,
    });

    const mockFailingProvider = {
      name: "byteplus" as const,
      listModels: vi.fn(),
      getJob: vi.fn(),
      cancel: vi.fn(),
      submit: vi.fn().mockRejectedValue(new Error("Provider API timeout")),
    };

    const validPayload = {
      organizationId: "org_1",
      modelId: "m_1",
      priceVersionId: "pv_1",
      idempotencyKey: "123e4567-e89b-12d3-a456-426614174001",
      messages: [{ role: "user" as const, content: "Greetings!" }],
      temperature: 0.7,
      maxTokens: 1024,
    };

    await expect(
      executeTextGeneration("user_1", validPayload, {
        provider: mockFailingProvider,
      }),
    ).rejects.toThrow("Provider API timeout");

    expect(mocks.credits.releaseOrRefundCredits).toHaveBeenCalled();
  });
});
