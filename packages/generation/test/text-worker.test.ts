import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn(),
    generationJob: {
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
    },
    providerModel: {
      findUnique: vi.fn(),
    },
    wallet: {
      findUniqueOrThrow: vi.fn(),
    },
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
    textProviderCostMicroUsd: vi.fn(() => 5_000n),
    parseTextUsageRatesForProvider: vi.fn((value) => value),
  },
}));

vi.mock("@aiwa/db", () => ({ db: mocks.db }));
vi.mock("@aiwa/credits", () => mocks.credits);

import { createTextJob, processTextJob } from "../src/text";

const validMembership = {
  role: "ORGANIZATION_MEMBER",
  monthlySpendingCapCredits: null,
  organization: { status: "ACTIVE" },
  user: { disabledAt: null, emailVerified: true },
};

const basePrice = {
  id: "pv_1",
  providerCostMicroUsd: 1_000n,
  pricingDimension: "TOKEN",
  unitQuantity: 1_000,
  usageRates: {
    estimator: "byteplus-text-v1",
    tiers: [
      {
        maxPromptTokens: 262144,
        inputMicroUsdPerMillionTokens: "500000",
        outputMicroUsdPerMillionTokens: "2500000",
      },
    ],
  },
  fxBaisaNumerator: 769n,
  fxBaisaDenominator: 2n,
  targetMarginBps: 2_500,
  creditsPerBaisa: 1n,
};

const validInput = {
  organizationId: "org_1",
  modelId: "m_1",
  priceVersionId: "pv_1",
  idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
  messages: [{ role: "user" as const, content: "Greetings!" }],
  temperature: 0.7,
  maxTokens: 1_024,
};

function admissionTx(existing: unknown = null) {
  return {
    $queryRaw: vi.fn(),
    membership: {
      findUnique: vi.fn().mockResolvedValue(validMembership),
    },
    generationJob: {
      findUnique: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockResolvedValue({
        id: "job_text_1",
        status: "QUEUED",
        organizationId: "org_1",
        createdById: "user_1",
      }),
      aggregate: vi.fn(),
    },
    providerModel: {
      findFirst: vi.fn().mockResolvedValue({
        id: "m_1",
        provider: "BYTEPLUS",
        providerModelId: "doubao-seed-character-260628",
        enabled: true,
        capabilities: { contextWindow: 32_768 },
        priceVersions: [basePrice],
      }),
    },
    wallet: {
      findUnique: vi.fn().mockResolvedValue({ id: "wallet_1" }),
    },
    project: {
      findUnique: vi.fn(),
    },
    auditEvent: {
      create: vi.fn(),
    },
  };
}

function queuedJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "job_text_1",
    status: "QUEUED",
    organizationId: "org_1",
    createdById: "user_1",
    providerModelId: "m_1",
    idempotencyKey: "server-hash",
    requestPayload: {
      messages: [{ role: "user", content: "Greetings!" }],
      temperature: 0.7,
      maxTokens: 1_024,
    },
    reservedCredits: 10n,
    billableQuantity: 1_024,
    quotedUnits: 2,
    providerModel: {
      mediaKind: "TEXT",
      providerModelId: "doubao-seed-character-260628",
    },
    priceVersion: basePrice,
    ...overrides,
  };
}

function settlementTx() {
  return {
    $queryRaw: vi.fn(),
    generationJob: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        status: "PROCESSING",
      }),
      update: vi.fn(),
    },
    auditEvent: {
      create: vi.fn(),
    },
  };
}

function providerResponse(rawUsage?: Record<string, unknown>) {
  return {
    name: "byteplus" as const,
    listModels: vi.fn(),
    getJob: vi.fn(),
    cancel: vi.fn(),
    submit: vi.fn().mockResolvedValue({
      providerRequestId: "req_1",
      status: "succeeded" as const,
      textOutput: { content: "A durable answer." },
      ...(rawUsage ? { rawUsage } : {}),
    }),
  };
}

describe("durable text generation billing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.db.generationJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.db.membership.findUnique.mockResolvedValue(validMembership);
    mocks.db.providerModel.findUnique.mockResolvedValue({ enabled: true });
    mocks.db.wallet.findUniqueOrThrow.mockResolvedValue({ id: "wallet_1" });
    mocks.credits.estimateGeneration.mockReturnValue({
      quote: { customerCredits: 5n },
      reservation: { customerCredits: 10n },
      estimatedTokens: 2_048n,
      units: 2,
      billableQuantity: 2_048,
      settlement: "ACTUAL_USAGE",
    });
    mocks.credits.createCreditQuote.mockReturnValue({ customerCredits: 5n });
    mocks.credits.textProviderCostMicroUsd.mockReturnValue(5_000n);
  });

  it("validates malformed input before opening a transaction", async () => {
    await expect(
      createTextJob("user_1", {
        ...validInput,
        idempotencyKey: "not-a-uuid",
        messages: [],
      }),
    ).rejects.toThrow();

    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("reserves credits and queues a durable job", async () => {
    const tx = admissionTx();
    mocks.db.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx),
    );

    const job = await createTextJob("user_1", validInput);

    expect(job.status).toBe("QUEUED");
    expect(mocks.credits.reserveCreditsForJob).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        walletId: "wallet_1",
        amountCredits: 10n,
        jobId: "job_text_1",
      }),
    );
    expect(tx.generationJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "QUEUED",
          providerModelId: "m_1",
          priceVersionId: "pv_1",
        }),
      }),
    );
  });

  it("queues sponsored text without reserving customer credits", async () => {
    const tx = admissionTx();
    mocks.db.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx),
    );

    const job = await createTextJob("user_1", validInput, {
      sponsored: true,
    });

    expect(job.status).toBe("QUEUED");
    expect(tx.wallet.findUnique).not.toHaveBeenCalled();
    expect(mocks.credits.reserveCreditsForJob).not.toHaveBeenCalled();
    expect(tx.generationJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requestPayload: expect.objectContaining({ sponsored: true }),
        }),
      }),
    );
  });

  it("replays identical requests and rejects changed inputs", async () => {
    const existing = {
      id: "job_cached",
      status: "SUCCEEDED",
      projectId: null,
      templateId: null,
      providerModelId: "m_1",
      priceVersionId: "pv_1",
      requestPayload: {
        messages: validInput.messages,
        temperature: 0.7,
        maxTokens: 1_024,
      },
      outputPayload: { content: "Cached answer" },
      chargedCredits: 3n,
    };

    mocks.db.$transaction.mockImplementationOnce(async (callback) =>
      callback(admissionTx(existing)),
    );
    await expect(createTextJob("user_1", validInput)).resolves.toMatchObject({
      id: "job_cached",
      status: "SUCCEEDED",
    });

    mocks.db.$transaction.mockImplementationOnce(async (callback) =>
      callback(admissionTx(existing)),
    );
    await expect(
      createTextJob("user_1", {
        ...validInput,
        messages: [{ role: "user", content: "Changed" }],
      }),
    ).rejects.toThrow("different inputs");
  });

  it("binds and forwards structured response format for durable text jobs", async () => {
    const tx = admissionTx();
    mocks.db.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx),
    );

    await createTextJob("user_1", {
      ...validInput,
      responseFormat: "json_object",
    });

    expect(tx.generationJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requestPayload: expect.objectContaining({
            responseFormat: "json_object",
          }),
        }),
      }),
    );

    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue(
      queuedJob({
        requestPayload: {
          messages: [{ role: "user", content: "Return JSON" }],
          temperature: 0.7,
          maxTokens: 1_024,
          responseFormat: "json_object",
        },
      }),
    );
    const settleTx = settlementTx();
    mocks.db.$transaction.mockImplementationOnce(async (callback) =>
      callback(settleTx),
    );
    const provider = {
      name: "groq" as const,
      chat: vi.fn().mockResolvedValue({
        providerRequestId: "groq-json-1",
        content: '{"ok":true}',
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
      }),
    };

    await processTextJob("job_text_1", provider);

    expect(provider.chat).toHaveBeenCalledWith(
      expect.objectContaining({ responseFormat: "json_object" }),
    );
  });

  it("captures reliable provider usage after worker completion", async () => {
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue(queuedJob());
    const tx = settlementTx();
    mocks.db.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx),
    );
    const provider = providerResponse({
      prompt_tokens: 50,
      completion_tokens: 120,
      total_tokens: 170,
    });

    await processTextJob("job_text_1", provider);

    expect(provider.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "doubao-seed-character-260628",
        mediaKind: "text",
      }),
    );
    expect(mocks.credits.captureCreditsForJob).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        jobId: "job_text_1",
        amountCredits: 5n,
      }),
    );
    expect(tx.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SUCCEEDED",
          chargedCredits: 5n,
        }),
      }),
    );
  });

  it.each([
    ["groq", "openai/gpt-oss-20b"],
    ["groq", "openai/gpt-oss-120b"],
    ["gemini", "gemini-3.5-flash-lite"],
    ["gemini", "gemini-3.8-flash"],
    ["cloudflare", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"],
  ])(
    "settles %s text generation from provider-reported usage",
    async (providerName, providerModelId) => {
      const externalRates = {
        estimator: "text-token-v1",
        tiers: [
          {
            maxPromptTokens: 1_048_576,
            inputMicroUsdPerMillionTokens: "1000000",
            outputMicroUsdPerMillionTokens: "2000000",
          },
        ],
      };
      mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue(
        queuedJob({
          providerModel: {
            mediaKind: "TEXT",
            providerModelId,
          },
          priceVersion: {
            ...basePrice,
            providerCostMicroUsd: 2000n,
            usageRates: externalRates,
          },
        }),
      );
      const tx = settlementTx();
      mocks.db.$transaction.mockImplementationOnce(async (callback) =>
        callback(tx),
      );
      const provider = {
        name: providerName,
        chat: vi.fn().mockResolvedValue({
          providerRequestId: `${providerName}-request-1`,
          content: "External provider answer.",
          usage: {
            promptTokens: 50,
            completionTokens: 120,
            totalTokens: 170,
          },
        }),
      };

      await processTextJob(
        "job_text_1",
        provider as Parameters<typeof processTextJob>[1],
      );

      expect(provider.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          modelId: providerModelId,
        }),
      );
      expect(mocks.credits.textProviderCostMicroUsd).toHaveBeenCalledWith(
        externalRates,
        {
          promptTokens: 50,
          completionTokens: 120,
          cachedPromptTokens: 0,
        },
      );
      expect(mocks.credits.captureCreditsForJob).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          jobId: "job_text_1",
          amountCredits: 5n,
          metadata: expect.objectContaining({
            promptTokens: 50,
            completionTokens: 120,
            totalTokens: 170,
            usageFallback: false,
          }),
        }),
      );
      expect(tx.generationJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "SUCCEEDED",
            actualProviderCostMicroUsd: 5_000n,
            providerCostBasis: "PROVIDER_USAGE",
            chargedCredits: 5n,
          }),
        }),
      );
    },
  );

  it("records sponsored provider cost while charging zero customer credits", async () => {
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue(
      queuedJob({
        reservedCredits: 0n,
        requestPayload: {
          messages: [{ role: "user", content: "Greetings!" }],
          temperature: 0.7,
          maxTokens: 1_024,
          sponsored: true,
        },
      }),
    );
    const tx = settlementTx();
    mocks.db.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx),
    );

    await processTextJob(
      "job_text_1",
      providerResponse({
        prompt_tokens: 50,
        completion_tokens: 120,
        total_tokens: 170,
      }),
    );

    expect(mocks.db.wallet.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(mocks.credits.captureCreditsForJob).not.toHaveBeenCalled();
    expect(tx.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SUCCEEDED",
          chargedCredits: 0n,
          actualProviderCostMicroUsd: 1_000n,
          providerCostBasis: "CONFIGURED_RATE",
        }),
      }),
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            sponsored: true,
            chargedCredits: "0",
          }),
        }),
      }),
    );
  });

  it("never captures above the authorized reservation", async () => {
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue(queuedJob());
    mocks.credits.createCreditQuote.mockReturnValue({ customerCredits: 20n });

    await processTextJob(
      "job_text_1",
      providerResponse({
        prompt_tokens: 1_000,
        completion_tokens: 1_000,
        total_tokens: 2_000,
      }),
    );

    expect(mocks.credits.captureCreditsForJob).not.toHaveBeenCalled();
    expect(mocks.db.generationJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job_text_1", status: "PROCESSING" },
        data: expect.objectContaining({
          status: "MANUAL_REVIEW",
          errorCode: "SETTLEMENT_EXCEEDS_RESERVATION",
        }),
      }),
    );
  });

  it("uses the reservation when provider usage telemetry is missing", async () => {
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue(queuedJob());
    const tx = settlementTx();
    mocks.db.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx),
    );

    await processTextJob("job_text_1", providerResponse());

    expect(mocks.credits.captureCreditsForJob).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        jobId: "job_text_1",
        amountCredits: 10n,
        metadata: expect.objectContaining({ usageFallback: true }),
      }),
    );
  });

  it("preserves the reservation when provider outcome is ambiguous", async () => {
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue(queuedJob());
    const provider = {
      name: "byteplus" as const,
      listModels: vi.fn(),
      getJob: vi.fn(),
      cancel: vi.fn(),
      submit: vi.fn().mockRejectedValue(new Error("Provider timeout")),
    };

    await processTextJob("job_text_1", provider);

    expect(mocks.credits.releaseOrRefundCredits).not.toHaveBeenCalled();
    expect(mocks.db.generationJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job_text_1", status: "SUBMITTED" },
        data: expect.objectContaining({
          status: "MANUAL_REVIEW",
          errorCode: "PROVIDER_OUTCOME_UNKNOWN",
        }),
      }),
    );
  });

  it("releases credits if the model is disabled before submission", async () => {
    mocks.db.generationJob.findUniqueOrThrow.mockResolvedValue(queuedJob());
    mocks.db.providerModel.findUnique.mockResolvedValue({ enabled: false });
    const failTx = {
      $queryRaw: vi.fn(),
      generationJob: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          status: "SUBMITTED",
          organizationId: "org_1",
        }),
        update: vi.fn(),
      },
      wallet: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "wallet_1" }),
      },
    };
    mocks.db.$transaction.mockImplementationOnce(async (callback) =>
      callback(failTx),
    );
    const provider = providerResponse();

    await processTextJob("job_text_1", provider);

    expect(provider.submit).not.toHaveBeenCalled();
    expect(mocks.credits.releaseOrRefundCredits).toHaveBeenCalledWith(
      failTx,
      expect.objectContaining({
        jobId: "job_text_1",
        idempotencyKey: "generation-release-job_text_1",
      }),
    );
    expect(failTx.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          errorCode: "MODEL_DISABLED",
        }),
      }),
    );
  });
});
