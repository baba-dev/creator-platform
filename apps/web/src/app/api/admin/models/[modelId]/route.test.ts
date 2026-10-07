import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  trusted: vi.fn(),
  session: vi.fn(),
  db: {
    providerModel: { findUnique: vi.fn() },
    modelPriceVersion: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    auditEvent: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/request-security", () => ({
  hasTrustedMutationOrigin: mocks.trusted,
}));
vi.mock("@/lib/request-auth", () => ({ getRequestSession: mocks.session }));
vi.mock("@aiwa/db", () => ({ db: mocks.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { PATCH } from "./route";
const modelId = "creator-byteplus-dreamina-seedance-2-5-260628";
const usageRates = {
  estimator: "byteplus-video-v1",
  rates: [
    {
      resolution: "720p",
      workflow: "GENERATE",
      microUsdPerThousandTokens: "10700",
    },
    {
      resolution: "1080p",
      workflow: "GENERATE",
      microUsdPerThousandTokens: "11700",
    },
    {
      resolution: "720p",
      workflow: "VIDEO_INPUT",
      microUsdPerThousandTokens: "6400",
    },
    {
      resolution: "1080p",
      workflow: "VIDEO_INPUT",
      microUsdPerThousandTokens: "7000",
    },
  ],
};
const params = {
  providerCostMicroUsd: "10700",
  pricingDimension: "TOKEN",
  targetMarginBps: 2500,
  idempotencyKey: "d1f8f7c8-23a3-4aac-a9b4-52f4d8b39721",
  usageRates,
};
function request(body: unknown) {
  return new Request("https://example.com/api/admin/models/" + modelId, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
const context = { params: Promise.resolve({ modelId }) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.trusted.mockReturnValue(true);
  mocks.session.mockResolvedValue({
    user: { id: "owner", platformRole: "PLATFORM_OWNER" },
  });
  mocks.db.providerModel.findUnique.mockResolvedValue({
    id: modelId,
    provider: "BYTEPLUS",
    providerModelId: "dreamina-seedance-2-5-260628",
    displayName: "Seedance",
    mediaKind: "VIDEO",
    capabilities: {
      "resolution:720p": true,
      "resolution:1080p": true,
      referenceVideo: true,
    },
  });
  mocks.db.modelPriceVersion.findUnique.mockResolvedValue(null);
  mocks.db.modelPriceVersion.findFirst.mockResolvedValue({
    pricingDimension: "SECOND",
    unitQuantity: 5,
    providerCostMicroUsd: 468000n,
    fxBaisaNumerator: 769n,
    fxBaisaDenominator: 2n,
  });
  mocks.db.modelPriceVersion.create.mockImplementation(({ data }) =>
    Promise.resolve({
      ...data,
      id: "new-price",
      effectiveFrom: new Date("2026-09-30T00:00:00Z"),
    }),
  );
  mocks.db.$transaction.mockImplementation((fn) => fn(mocks.db));
});
describe("token price publication", () => {
  it("publishes the complete rate snapshot without a misleading flat customer price", async () => {
    const res = await PATCH(request(params), context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.priceVersion.usageRates).toEqual(usageRates);
    expect(body.priceVersion.customerCredits).toBe("0");
    expect(body.priceVersion.unitQuantity).toBe("1000");
    expect(mocks.db.modelPriceVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          publicationKey: params.idempotencyKey,
          usageRates,
        }),
      }),
    );
  });
  it("rejects missing rates, duplicate selectors, legacy Seedance pricing and changing credit denomination", async () => {
    expect(
      (await PATCH(request({ ...params, usageRates: undefined }), context))
        .status,
    ).toBe(400);
    expect(
      (
        await PATCH(
          request({
            ...params,
            usageRates: {
              ...usageRates,
              rates: [usageRates.rates[0], usageRates.rates[0]],
            },
          }),
          context,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await PATCH(
          request({
            ...params,
            pricingDimension: "SECOND",
            usageRates: undefined,
          }),
          context,
        )
      ).status,
    ).toBe(400);
    expect(
      (await PATCH(request({ ...params, creditsPerBaisa: "2" }), context))
        .status,
    ).toBe(400);
    expect(
      (await PATCH(request({ ...params, idempotencyKey: undefined }), context))
        .status,
    ).toBe(400);
  });
  it("replays the same publication key and rejects a changed payload", async () => {
    await PATCH(request(params), context);
    const created = mocks.db.modelPriceVersion.create.mock.calls[0]![0].data;
    mocks.db.modelPriceVersion.findUnique.mockResolvedValue({
      ...created,
      id: "existing-price",
      effectiveFrom: new Date(),
    });
    expect((await PATCH(request(params), context)).status).toBe(200);
    expect(mocks.db.modelPriceVersion.create).toHaveBeenCalledTimes(1);
    expect(
      (await PATCH(request({ ...params, targetMarginBps: 3000 }), context))
        .status,
    ).toBe(409);
  });
});

describe("provider-aware text pricing", () => {
  const textUsageRates = {
    estimator: "text-token-v1",
    tiers: [
      {
        maxPromptTokens: 131072,
        inputMicroUsdPerMillionTokens: "1000000",
        outputMicroUsdPerMillionTokens: "2000000",
      },
    ],
  };
  const bytePlusTextUsageRates = {
    ...textUsageRates,
    estimator: "byteplus-text-v1",
  };
  const textParams = {
    providerCostMicroUsd: "2000",
    pricingDimension: "TOKEN",
    targetMarginBps: 2500,
    idempotencyKey: "69331a23-2ea7-419a-b82d-a095de67568b",
    usageRates: textUsageRates,
  };

  beforeEach(() => {
    mocks.db.providerModel.findUnique.mockResolvedValue({
      id: modelId,
      provider: "GROQ",
      providerModelId: "openai/gpt-oss-20b",
      displayName: "GPT-OSS 20B",
      mediaKind: "TEXT",
      capabilities: { contextWindow: 131072, scriptwriting: true },
    });
    mocks.db.modelPriceVersion.findUnique.mockResolvedValue(null);
    mocks.db.modelPriceVersion.findFirst.mockResolvedValue({
      pricingDimension: "TOKEN",
      unitQuantity: 1000,
      providerCostMicroUsd: 2000n,
      usageRates: textUsageRates,
      fxBaisaNumerator: 769n,
      fxBaisaDenominator: 2n,
    });
  });

  it("publishes text-token-v1 for external text providers", async () => {
    const res = await PATCH(request(textParams), context);
    expect(res.status).toBe(200);
    expect(mocks.db.modelPriceVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerCostMicroUsd: 2000n,
          usageRates: textUsageRates,
          pricingDimension: "TOKEN",
          unitQuantity: 1000,
        }),
      }),
    );
  });

  it("rejects the BytePlus text estimator for an external provider", async () => {
    const res = await PATCH(
      request({
        ...textParams,
        idempotencyKey: "c607a068-69d0-4545-af2a-0c9c0bb90210",
        usageRates: bytePlusTextUsageRates,
      }),
      context,
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining("text-token-v1"),
    });
  });

  it("rejects text-token-v1 for BytePlus text models", async () => {
    mocks.db.providerModel.findUnique.mockResolvedValue({
      id: modelId,
      provider: "BYTEPLUS",
      providerModelId: "seed-2-0-lite-260428",
      displayName: "Seed 2.0 Lite",
      mediaKind: "TEXT",
      capabilities: { contextWindow: 262144, scriptwriting: true },
    });
    const res = await PATCH(
      request({
        ...textParams,
        idempotencyKey: "68a2bfcb-ce21-4845-a567-62ac1ad0ee35",
      }),
      context,
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining("byteplus-text-v1"),
    });
  });

  it("refuses to enable an external text model with a mismatched active estimator", async () => {
    mocks.db.modelPriceVersion.findFirst.mockResolvedValue({
      pricingDimension: "TOKEN",
      unitQuantity: 1000,
      providerCostMicroUsd: 2000n,
      usageRates: bytePlusTextUsageRates,
    });
    const res = await PATCH(request({ enabled: true }), context);
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining("text-token-v1"),
    });
  });
});

describe("reasoning provider-cost pricing", () => {
  const reasoningRates = {
    estimator: "text-token-v1",
    tiers: [
      {
        maxPromptTokens: 131072,
        inputMicroUsdPerMillionTokens: "1000000",
        outputMicroUsdPerMillionTokens: "2000000",
      },
    ],
  };

  beforeEach(() => {
    mocks.db.providerModel.findUnique.mockResolvedValue({
      id: modelId,
      provider: "NVIDIA",
      providerModelId: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
      displayName: "Nemotron",
      mediaKind: "REASONING",
      capabilities: { "task:prompt-enhancement": true, reasoning: true },
    });
    mocks.db.modelPriceVersion.findUnique.mockResolvedValue(null);
    mocks.db.modelPriceVersion.findFirst.mockResolvedValue({
      pricingDimension: "REQUEST",
      unitQuantity: 1,
      providerCostMicroUsd: 2500n,
      fxBaisaNumerator: 769n,
      fxBaisaDenominator: 2n,
    });
  });

  it("publishes token rates for reasoning while keeping workspace customer charge zero", async () => {
    const res = await PATCH(
      request({
        providerCostMicroUsd: "2000",
        pricingDimension: "TOKEN",
        targetMarginBps: 2500,
        idempotencyKey: "8e0ec2bd-c65d-489f-af11-b1baf9720fb2",
        usageRates: reasoningRates,
      }),
      context,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.priceVersion.customerCredits).toBe("0");
    expect(body.priceVersion.usageRates).toEqual(reasoningRates);
    expect(mocks.db.modelPriceVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pricingDimension: "TOKEN",
          customerCredits: 0n,
          usageRates: reasoningRates,
        }),
      }),
    );
  });

  it("also keeps fixed per-request reasoning snapshots uncharged", async () => {
    const res = await PATCH(
      request({
        providerCostMicroUsd: "2500",
        pricingDimension: "REQUEST",
        targetMarginBps: 2500,
        idempotencyKey: "71953e3e-ef70-447c-b132-f14e3fab9bbd",
      }),
      context,
    );

    expect(res.status).toBe(200);
    expect(mocks.db.modelPriceVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pricingDimension: "REQUEST",
          customerCredits: 0n,
        }),
      }),
    );
  });
});

describe("Seed Audio duration pricing", () => {
  beforeEach(() => {
    mocks.db.providerModel.findUnique.mockResolvedValue({
      id: modelId,
      provider: "BYTEPLUS",
      providerModelId: "seed-audio-1.0",
      displayName: "Seed Audio 1.0",
      mediaKind: "VOICE",
      capabilities: {
        audioGeneration: true,
        maxOutputSeconds: 120,
      },
    });
    mocks.db.modelPriceVersion.findUnique.mockResolvedValue(null);
    mocks.db.modelPriceVersion.findFirst.mockResolvedValue({
      pricingDimension: "SECOND",
      unitQuantity: 1,
      providerCostMicroUsd: 1000n,
      fxBaisaNumerator: 769n,
      fxBaisaDenominator: 2n,
    });
  });

  it("publishes the required per-second price", async () => {
    const res = await PATCH(
      request({
        providerCostMicroUsd: "1000",
        pricingDimension: "SECOND",
        unitQuantity: 1,
        targetMarginBps: 2000,
        idempotencyKey: "75578506-dc1c-48c5-a494-10911a77e350",
      }),
      context,
    );

    expect(res.status).toBe(200);
    expect(mocks.db.modelPriceVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pricingDimension: "SECOND",
          unitQuantity: 1,
          providerCostMicroUsd: 1000n,
        }),
      }),
    );
  });

  it("rejects non-duration pricing for Seed Audio", async () => {
    const res = await PATCH(
      request({
        providerCostMicroUsd: "1000",
        pricingDimension: "REQUEST",
        unitQuantity: 1,
        targetMarginBps: 2000,
        idempotencyKey: "06042e99-f18d-494c-ae49-26dc54b05c05",
      }),
      context,
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining("Audio generation models require SECOND"),
    });
  });
});

describe("transcription pricing separation", () => {
  beforeEach(() => {
    mocks.db.providerModel.findUnique.mockResolvedValue({
      id: modelId,
      provider: "GROQ",
      providerModelId: "whisper-large-v3-turbo",
      displayName: "Whisper Large v3 Turbo",
      mediaKind: "VOICE",
      capabilities: {
        transcription: true,
        subtitles: true,
        fast: true,
      },
    });
    mocks.db.modelPriceVersion.findUnique.mockResolvedValue(null);
    mocks.db.modelPriceVersion.findFirst.mockResolvedValue({
      pricingDimension: "SECOND",
      unitQuantity: 60,
      providerCostMicroUsd: 4000n,
      fxBaisaNumerator: 769n,
      fxBaisaDenominator: 2n,
    });
  });

  it("allows duration pricing for transcription models", async () => {
    const res = await PATCH(
      request({
        providerCostMicroUsd: "4000",
        pricingDimension: "SECOND",
        unitQuantity: 60,
        targetMarginBps: 2500,
        idempotencyKey: "d32208ba-cb6e-490e-9356-55822dd8b61f",
      }),
      context,
    );

    expect(res.status).toBe(200);
    expect(mocks.db.modelPriceVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pricingDimension: "SECOND",
          unitQuantity: 60,
        }),
      }),
    );
  });

  it("rejects character pricing for transcription models", async () => {
    const res = await PATCH(
      request({
        providerCostMicroUsd: "4000",
        pricingDimension: "CHARACTER",
        unitQuantity: 1000,
        targetMarginBps: 2500,
        idempotencyKey: "0bc5c95d-1da2-4036-bccc-a44ae38b67a4",
      }),
      context,
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining("Transcription models require"),
    });
  });

  it("rejects duration pricing for TTS models", async () => {
    mocks.db.providerModel.findUnique.mockResolvedValue({
      id: modelId,
      provider: "BYTEPLUS",
      providerModelId: "seed-tts-2.0",
      displayName: "Seed TTS 2.0",
      mediaKind: "VOICE",
      capabilities: { speechSynthesis: true },
    });
    const res = await PATCH(
      request({
        providerCostMicroUsd: "4000",
        pricingDimension: "SECOND",
        unitQuantity: 60,
        targetMarginBps: 2500,
        idempotencyKey: "54e263aa-adb7-4552-88f0-00435942efcf",
      }),
      context,
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining("Speech synthesis models require"),
    });
  });
});
