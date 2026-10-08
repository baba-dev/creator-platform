import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as AssetsModule from "@aiwa/assets";
import type * as CreditsModule from "@aiwa/credits";

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    membership: { findUnique: vi.fn() },
    providerToolExecution: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    providerTool: { findFirst: vi.fn() },
    asset: { findFirst: vi.fn(), create: vi.fn() },
    wallet: { findUnique: vi.fn() },
    providerToolInputAsset: { create: vi.fn() },
    auditEvent: { create: vi.fn() },
  };
  return {
    tx,
    db: {
      $transaction: vi.fn(),
      membership: tx.membership,
      providerToolExecution: { findUnique: vi.fn(), updateMany: vi.fn() },
    },
    reserve: vi.fn(),
    capture: vi.fn(),
    download: vi.fn(),
    storage: vi.fn(),
  };
});
vi.mock("@aiwa/db", () => ({ db: mocks.db }));
vi.mock("@aiwa/assets", async (original) => ({
  ...(await original<typeof AssetsModule>()),
  reserveAssetStorage: mocks.storage,
  finalizeAssetStorage: vi.fn(),
  releaseAssetStorage: vi.fn(),
}));
vi.mock("@aiwa/credits", async (original) => ({
  ...(await original<typeof CreditsModule>()),
  reserveCreditsForReference: mocks.reserve,
  captureCreditsForReference: mocks.capture,
}));
vi.mock("../src/storage", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  downloadImage: mocks.download,
}));
import {
  createProviderToolExecution,
  processProviderToolExecution,
  recoverMediaToolRequest,
} from "../src/media-tools";

const request = {
  organizationId: "org",
  toolId: "tool",
  priceVersionId: "price",
  idempotencyKey: "50a49a7b-b2f4-4cf4-8050-e167710996d6",
  quotedQuantity: 1024,
  input: { quality: 80 },
  sourceAssets: [{ assetId: "image", role: "SOURCE_IMAGE", position: 0 }],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.$transaction.mockImplementation((fn) => fn(mocks.tx));
  mocks.tx.membership.findUnique.mockResolvedValue({
    role: "ORGANIZATION_OWNER",
    monthlySpendingCapCredits: null,
    user: { disabledAt: null, emailVerified: true },
    organization: { status: "ACTIVE" },
  });
  mocks.tx.providerToolExecution.findUnique.mockResolvedValue(null);
  mocks.tx.providerToolExecution.findFirst.mockResolvedValue(null);
  mocks.tx.providerToolExecution.count.mockResolvedValue(0);
  mocks.tx.providerTool.findFirst.mockResolvedValue({
    id: "tool",
    providerToolId: "compress-image",
    pricingMetric: "INPUT_BYTE",
    priceVersions: [
      {
        id: "price",
        pricingMetric: "INPUT_BYTE",
        providerCostMicroUsd: 10000n,
        proportional: true,
        unitQuantity: 1073741824,
        fxBaisaNumerator: 769n,
        fxBaisaDenominator: 2n,
        targetMarginBps: 2000,
        creditsPerBaisa: 1n,
      },
    ],
  });
  mocks.tx.asset.findFirst.mockResolvedValue({
    id: "image",
    organizationId: "org",
    projectId: null,
    status: "READY",
    purpose: "REFERENCE_INPUT",
    storageOwnerUserId: "user",
    mediaKind: "IMAGE",
    mimeType: "image/png",
    byteSize: 1024n,
    width: 640,
    height: 480,
  });
  mocks.tx.wallet.findUnique.mockResolvedValue({ id: "wallet" });
  mocks.tx.providerToolExecution.create.mockImplementation(({ data }) => ({
    ...data,
    id: "execution",
  }));
});

describe("MediaKit admission protects source assets and reservations", () => {
  it("recovers an image download without submitting or charging again", async () => {
    const priceVersion = {
      ...(await mocks.tx.providerTool.findFirst()).priceVersions[0],
      pricingMetric: "REQUEST",
      unitQuantity: 1,
    };
    mocks.db.providerToolExecution.findUnique.mockResolvedValue({
      id: "execution",
      organizationId: "org",
      createdById: "user",
      status: "PROCESSING",
      retryCount: 0,
      maxAttempts: 8,
      providerTool: { providerToolId: "face-blur-image", category: "image" },
      priceVersion,
      resultPayload: { image_url: "https://provider.example/output.png" },
      outputAssets: [
        {
          id: "output",
          status: "PENDING",
          mimeType: "image/png",
          objectKey: "execution-tool.png",
        },
      ],
    });
    mocks.download.mockRejectedValue(new Error("Temporary storage failure"));
    const provider = {
      name: "byteplus-mediakit" as const,
      listTools: () => [],
      submit: vi.fn(),
      getTask: vi.fn(),
    };
    await processProviderToolExecution("execution", provider);
    expect(provider.submit).not.toHaveBeenCalled();
    expect(provider.getTask).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(mocks.db.providerToolExecution.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          retryCount: 1,
          errorCode: "TOOL_OUTPUT_STORAGE_FAILED",
        }),
      }),
    );
  });
  it("rejects another user's private image before reserving money or storage", async () => {
    await expect(
      createProviderToolExecution("other-user", request),
    ).rejects.toThrow(/Source image/);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.storage).not.toHaveBeenCalled();
  });
  it("ignores a caller's claimed byte count and requires the canonical asset size", async () => {
    await expect(
      createProviderToolExecution("user", { ...request, quotedQuantity: 1 }),
    ).rejects.toThrow(/stale/);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("rejects caller-controlled provider URLs", async () => {
    await expect(
      createProviderToolExecution("user", {
        ...request,
        input: { image_url: "https://untrusted.example/source.png" },
      }),
    ).rejects.toThrow();
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("reserves bounded storage and credits atomically with a durable image output", async () => {
    const execution = await createProviderToolExecution("user", request);
    expect(execution.status).toBe("QUEUED");
    expect(mocks.storage).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({ organizationId: "org", userId: "user" }),
    );
    expect(mocks.tx.asset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mediaKind: "IMAGE",
          status: "PENDING",
          sourceAssetId: "image",
          mimeType: "image/jpeg",
        }),
      }),
    );
    expect(mocks.reserve).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({
        referenceId: "execution",
        amountCredits: execution.reservedCredits,
      }),
    );
  });
  it("returns an existing identical execution without another reservation", async () => {
    const execution = await createProviderToolExecution("user", request);
    mocks.tx.providerToolExecution.findUnique.mockResolvedValue(execution);
    mocks.reserve.mockClear();
    mocks.storage.mockClear();
    expect(await createProviderToolExecution("user", request)).toBe(execution);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.storage).not.toHaveBeenCalled();
  });
});

describe("visual edits admission", () => {
  it("rejects a crop beyond canonical dimensions before any reservation", async () => {
    const tool = await mocks.tx.providerTool.findFirst();
    mocks.tx.providerTool.findFirst.mockResolvedValue({
      ...tool,
      providerToolId: "crop-image",
    });
    await expect(
      createProviderToolExecution("user", {
        ...request,
        input: {
          crop_mode: "custom",
          custom_x1: 0,
          custom_y1: 0,
          custom_x2: 641,
          custom_y2: 480,
        },
      }),
    ).rejects.toThrow(/dimensions/);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it.each(["private", "oversized"])(
    "rejects a %s logo before any reservation",
    async (reason) => {
      const tool = await mocks.tx.providerTool.findFirst();
      mocks.tx.providerTool.findFirst.mockResolvedValue({
        ...tool,
        providerToolId: "add-image-watermark",
      });
      const source = await mocks.tx.asset.findFirst();
      mocks.tx.asset.findFirst
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce({
          ...source,
          id: "logo",
          storageOwnerUserId: reason === "private" ? "other" : "user",
          byteSize: reason === "oversized" ? 5n * 1024n * 1024n + 1n : 1024n,
        });
      await expect(
        createProviderToolExecution("user", {
          ...request,
          input: { watermark_type: "image" },
          sourceAssets: [
            ...request.sourceAssets,
            { assetId: "logo", role: "WATERMARK_IMAGE", position: 1 },
          ],
        }),
      ).rejects.toThrow(/Logo/);
      expect(mocks.reserve).not.toHaveBeenCalled();
    },
  );
  it("persists both logo/source identities with one original-byte reservation", async () => {
    const tool = await mocks.tx.providerTool.findFirst();
    mocks.tx.providerTool.findFirst.mockResolvedValue({
      ...tool,
      providerToolId: "add-image-watermark",
    });
    const source = await mocks.tx.asset.findFirst();
    mocks.tx.asset.findFirst
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce({ ...source, id: "logo" });
    await createProviderToolExecution("user", {
      ...request,
      input: { watermark_type: "image" },
      sourceAssets: [
        ...request.sourceAssets,
        { assetId: "logo", role: "WATERMARK_IMAGE", position: 1 },
      ],
    });
    expect(mocks.tx.providerToolInputAsset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assetId: "logo",
          position: 1,
          role: "WATERMARK_IMAGE",
        }),
      }),
    );
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
  });
  it("recovers the same accepted request even after its price retires", async () => {
    const input = { quality: 80, output_format: "jpeg" };
    const execution = await createProviderToolExecution("user", {
      ...request,
      input,
    });
    mocks.db.providerToolExecution.findUnique.mockResolvedValue({
      ...execution,
      providerTool: { providerToolId: "compress-image" },
    });
    mocks.reserve.mockClear();
    const params = {
      organizationId: "org",
      toolKey: "compress-image",
      assetIds: ["image"],
      input,
      idempotencyKey: request.idempotencyKey,
      priceVersionId: "price",
      reservedCredits: execution.reservedCredits.toString(),
    };
    expect((await recoverMediaToolRequest("user", params))?.id).toBe(
      "execution",
    );
    await expect(
      recoverMediaToolRequest("user", { ...params, input: { quality: 70 } }),
    ).rejects.toThrow(/different/);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
});
