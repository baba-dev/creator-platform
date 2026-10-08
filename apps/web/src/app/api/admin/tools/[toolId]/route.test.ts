import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  trusted: vi.fn(),
  session: vi.fn(),
  tx: {
    $queryRaw: vi.fn(),
    providerTool: { update: vi.fn() },
    providerToolPriceVersion: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    auditEvent: { create: vi.fn() },
  },
  db: {
    providerTool: { findUnique: vi.fn() },
    providerToolPriceVersion: { findFirst: vi.fn(), findUnique: vi.fn() },
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

const toolId = "tool-123";
const context = { params: Promise.resolve({ toolId }) };
const tool = {
  id: toolId,
  providerToolId: "lip-sync",
  displayName: "Video Lip Sync",
  pricingMetric: "OUTPUT_SECOND",
  capabilities: {},
  enabled: false,
};

function request(body: unknown) {
  return new Request("https://example.com/api/admin/tools/" + toolId, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.trusted.mockReturnValue(true);
  mocks.session.mockResolvedValue({
    user: { id: "owner", platformRole: "PLATFORM_OWNER" },
  });
  mocks.db.providerTool.findUnique.mockResolvedValue(tool);
  mocks.db.providerToolPriceVersion.findUnique.mockResolvedValue(null);
  mocks.tx.providerToolPriceVersion.findUnique.mockResolvedValue(null);
  mocks.tx.providerToolPriceVersion.create.mockImplementation(({ data }) =>
    Promise.resolve({ ...data, id: "price-1", effectiveFrom: new Date() }),
  );
  mocks.db.$transaction.mockImplementation((fn) => fn(mocks.tx));
});

describe("MediaKit admin controls", () => {
  it("requires byte pricing to prorate usage", async () => {
    mocks.db.providerTool.findUnique.mockResolvedValue({
      ...tool,
      pricingMetric: "INPUT_BYTE",
    });
    const response = await PATCH(
      request({
        idempotencyKey: "50a49a7b-b2f4-4cf4-8050-e167710996d6",
        providerCostMicroUsd: "10000",
        targetMarginBps: 2000,
        unitQuantity: 1073741824,
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(mocks.tx.providerToolPriceVersion.create).not.toHaveBeenCalled();
  });

  it("rejects incomplete or unbounded matting tariffs", async () => {
    mocks.db.providerTool.findUnique.mockResolvedValue({
      ...tool,
      capabilities: { resolutionPricing: "matting" },
    });
    const response = await PATCH(
      request({
        idempotencyKey: "50a49a7b-b2f4-4cf4-8050-e167710996d6",
        providerCostMicroUsd: "300000",
        targetMarginBps: 2000,
        unitQuantity: 60,
        proportional: true,
        resolutionRates: { "720p": "300000" },
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(mocks.tx.providerToolPriceVersion.create).not.toHaveBeenCalled();
  });

  it("snapshots all matting tariffs alongside proportional pricing", async () => {
    mocks.db.providerTool.findUnique.mockResolvedValue({
      ...tool,
      capabilities: { resolutionPricing: "matting" },
    });
    const resolutionRates = {
      "720p": "300000",
      "1080p": "450000",
      "1440p": "900000",
      "2160p": "1200000",
    };
    const response = await PATCH(
      request({
        idempotencyKey: "50a49a7b-b2f4-4cf4-8050-e167710996d6",
        providerCostMicroUsd: "1200000",
        targetMarginBps: 2000,
        unitQuantity: 60,
        proportional: true,
        resolutionRates,
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(mocks.tx.providerToolPriceVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ proportional: true, resolutionRates }),
      }),
    );
  });
  it("requires a valid active price before enablement", async () => {
    mocks.db.providerToolPriceVersion.findFirst.mockResolvedValue(null);
    const response = await PATCH(request({ enabled: true }), context);
    expect(response.status).toBe(409);
  });

  it("does not enable variable-output billing without a detection-only price", async () => {
    mocks.db.providerTool.findUnique.mockResolvedValue({
      ...tool,
      providerToolId: "enhance-video-smoothness",
      pricingMetric: "INPUT_SECOND",
      capabilities: { variableBilling: "output-presence" },
    });
    mocks.db.providerToolPriceVersion.findFirst.mockResolvedValue({
      providerCostMicroUsd: 5000n,
      providerCostNoOutputMicroUsd: null,
      pricingMetric: "INPUT_SECOND",
    });
    const response = await PATCH(request({ enabled: true }), context);
    expect(response.status).toBe(409);
    expect(mocks.tx.providerTool.update).not.toHaveBeenCalled();
  });

  it("publishes immutable integer pricing with a 20% margin snapshot", async () => {
    const response = await PATCH(
      request({
        idempotencyKey: "50a49a7b-b2f4-4cf4-8050-e167710996d6",
        providerCostMicroUsd: "10000",
        targetMarginBps: 2000,
        unitQuantity: 10,
        providerCostBasisNote: "contract test",
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(mocks.tx.providerToolPriceVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pricingMetric: "OUTPUT_SECOND",
          unitQuantity: 10,
          providerCostMicroUsd: 10000n,
          creditsPerBaisa: 1n,
        }),
      }),
    );
  });

  it("accepts an 18 micro-USD per-request Intelligent Image Compression rate", async () => {
    mocks.db.providerTool.findUnique.mockResolvedValue({
      ...tool,
      providerToolId: "slim-image",
      displayName: "Intelligent Image Compression",
      pricingMetric: "REQUEST",
    });
    const response = await PATCH(
      request({
        idempotencyKey: "96c7d9b7-c8bd-46f9-89e3-04be9c2d301e",
        providerCostMicroUsd: "18",
        targetMarginBps: 2000,
        unitQuantity: 1,
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.tx.providerToolPriceVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pricingMetric: "REQUEST",
          unitQuantity: 1,
          providerCostMicroUsd: 18n,
          customerCredits: 2n,
        }),
      }),
    );
  });

  it("stores smoothness detection-only pricing below the repair ceiling", async () => {
    mocks.db.providerTool.findUnique.mockResolvedValue({
      ...tool,
      providerToolId: "enhance-video-smoothness",
      pricingMetric: "INPUT_SECOND",
      capabilities: { variableBilling: "output-presence" },
    });
    const response = await PATCH(
      request({
        idempotencyKey: "c9c99fd2-bba4-4702-b6cf-c7e09a3ee5d1",
        providerCostMicroUsd: "5000",
        providerCostNoOutputMicroUsd: "500",
        targetMarginBps: 2000,
        unitQuantity: 1,
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(mocks.tx.providerToolPriceVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerCostMicroUsd: 5000n,
          providerCostNoOutputMicroUsd: 500n,
        }),
      }),
    );
  });

  it("rejects a detection-only price above the repair price", async () => {
    mocks.db.providerTool.findUnique.mockResolvedValue({
      ...tool,
      providerToolId: "enhance-video-smoothness",
      pricingMetric: "INPUT_SECOND",
      capabilities: { variableBilling: "output-presence" },
    });
    const response = await PATCH(
      request({
        idempotencyKey: "16a7e04c-b4cb-48a0-b14a-461cb2420354",
        providerCostMicroUsd: "500",
        providerCostNoOutputMicroUsd: "501",
        targetMarginBps: 2000,
        unitQuantity: 1,
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(mocks.tx.providerToolPriceVersion.create).not.toHaveBeenCalled();
  });

  it("replays an identical publication key without creating another price", async () => {
    const body = {
      idempotencyKey: "50a49a7b-b2f4-4cf4-8050-e167710996d6",
      providerCostMicroUsd: "10000",
      targetMarginBps: 2000,
      unitQuantity: 10,
    };
    const first = await PATCH(request(body), context);
    expect(first.status).toBe(200);
    const created =
      mocks.tx.providerToolPriceVersion.create.mock.calls[0]![0].data;
    mocks.db.providerToolPriceVersion.findUnique.mockResolvedValue({
      ...created,
      id: "price-existing",
      effectiveFrom: new Date(),
    });
    const replay = await PATCH(request(body), context);
    expect(replay.status).toBe(200);
    expect(mocks.tx.providerToolPriceVersion.create).toHaveBeenCalledTimes(1);
  });
});
