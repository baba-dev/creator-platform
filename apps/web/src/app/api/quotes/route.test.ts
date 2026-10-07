import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  trusted: vi.fn(),
  session: vi.fn(),
  budget: vi.fn(),
  db: {
    membership: { findUnique: vi.fn() },
    providerModel: { findFirst: vi.fn() },
    wallet: { findUnique: vi.fn() },
    asset: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("@/lib/request-security", () => ({
  hasTrustedMutationOrigin: mocks.trusted,
}));
vi.mock("@/lib/request-auth", () => ({ getRequestSession: mocks.session }));
vi.mock("@aiwa/db", () => ({ db: mocks.db }));
vi.mock("@aiwa/organizations", () => ({
  checkMemberSpendingBudget: mocks.budget,
}));
vi.mock("@/lib/format-baisa", async () => import("../../../lib/format-baisa"));
import { POST } from "./route";
const org = "c12345678901234567890";
const price = {
  id: "price-1",
  providerCostMicroUsd: 31500n,
  fxBaisaNumerator: 769n,
  fxBaisaDenominator: 2n,
  targetMarginBps: 2500,
  creditsPerBaisa: 1n,
  pricingDimension: "REQUEST",
  unitQuantity: 1,
};
const model = {
  id: "model-1",
  providerModelId: "seedream-5-0-260128",
  displayName: "Lite",
  mediaKind: "IMAGE",
  capabilities: {
    "resolution:2K": true,
    "aspectRatio:1:1": true,
    maxGeneratedImages: 15,
    maxReferenceImages: 14,
    referenceImages: true,
  },
  priceVersions: [price],
};
function request(params: Record<string, unknown> = {}) {
  return new Request("https://example.com/api/quotes", {
    method: "POST",
    body: JSON.stringify({
      organizationId: org,
      modelId: "model-1",
      ...params,
    }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AUTH_SECRET", "test-only-auth-secret-for-quote-route-32");
  mocks.trusted.mockReturnValue(true);
  mocks.session.mockResolvedValue({
    user: { id: "user-1", platformRole: "USER" },
  });
  mocks.db.membership.findUnique.mockResolvedValue({
    role: "ORGANIZATION_OWNER",
    organization: { status: "ACTIVE" },
  });
  mocks.db.providerModel.findFirst.mockResolvedValue(model);
  mocks.db.wallet.findUnique.mockResolvedValue({ balanceCache: 10000n });
  mocks.budget.mockResolvedValue({
    monthlyCapCredits: null,
    currentMonthSpentCredits: 0n,
    proposedCredits: 72n,
    canSpend: true,
    remainingCredits: null,
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("authoritative quote API", () => {
  it("quotes the exact per-image reservation and hides commercial internals from customers", async () => {
    const response = await POST(request({ units: 4 }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.quote.customerCredits).toBe("72");
    expect(body.quote.estimatedOmr).toBe("0.072 OMR");
    expect(body.quote.quoteToken).toMatch(/\./);
    expect(body.quote.providerCostMicroUsd).toBeUndefined();
    expect(body.quote.targetGrossMarginBps).toBeUndefined();
    expect(body.wallet.balanceAfterReservationCredits).toBe("9928");
    expect(mocks.budget).toHaveBeenCalledWith(
      expect.objectContaining({ proposedCredits: 72n }),
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each(["720p", "1080p"])(
    "reports OmniHuman billable seconds at %s using trusted audio duration",
    async (resolution) => {
      mocks.db.providerModel.findFirst.mockResolvedValue({
        ...model,
        mediaKind: "VIDEO",
        providerModelId: "omnihuman-1.5",
        capabilities: {
          talkingAvatar: true,
          avatarImage: true,
          audioInput: true,
          "resolution:720p": true,
          "resolution:1080p": true,
          "aspectRatio:adaptive": true,
        },
        priceVersions: [
          {
            ...price,
            pricingDimension: "SECOND",
            providerCostMicroUsd: 120000n,
            targetMarginBps: 2000,
          },
        ],
      });
      const avatar = "c12345678901234567891";
      const audio = "c12345678901234567892";
      mocks.db.asset.findMany.mockResolvedValue([
        {
          id: avatar,
          mediaKind: "IMAGE",
          mimeType: "image/jpeg",
          byteSize: 100000n,
          width: 1024,
          height: 1024,
          durationMs: null,
        },
        {
          id: audio,
          mediaKind: "AUDIO",
          mimeType: "audio/mpeg",
          byteSize: 10000n,
          width: null,
          height: null,
          durationMs: 1200,
        },
      ]);
      const response = await POST(
        request({
          schemaVersion: 2,
          workflow: "TALKING_AVATAR",
          sources: [
            { assetId: avatar, role: "AVATAR_IMAGE", position: 0 },
            { assetId: audio, role: "DRIVING_AUDIO", position: 1 },
          ],
          resolution,
          aspectRatio: "adaptive",
          durationSeconds: -1,
          generateAudio: false,
          outputFormat: "mp4",
          returnLastFrame: false,
        }),
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.quote.estimatedUsage).toEqual({
        unit: "SECOND",
        quantity: "2",
        isEstimate: false,
      });
      expect(body.quote.estimatedCredits).toBe("117");
      expect(body.quote.reservationCredits).toBe("117");
      expect(body.quote.settlement).toBe("FIXED");
    },
  );

  it("returns commercial cost only to finance roles", async () => {
    mocks.session.mockResolvedValue({
      user: { id: "finance", platformRole: "FINANCE_ADMIN" },
    });
    const body = await (await POST(request())).json();
    expect(body.quote.providerCostMicroUsd).toBe("31500");
  });
  it("separates video estimates from holds and uses the hold for spending limits", async () => {
    mocks.db.providerModel.findFirst.mockResolvedValue({
      ...model,
      mediaKind: "VIDEO",
      providerModelId: "dreamina-seedance-2-5-260628",
      capabilities: {
        "resolution:720p": true,
        "aspectRatio:16:9": true,
        "durationSeconds:5": true,
        generateAudio: true,
        returnLastFrame: true,
      },
      priceVersions: [
        {
          ...price,
          pricingDimension: "TOKEN",
          unitQuantity: 1000,
          usageRates: {
            estimator: "byteplus-video-v1",
            rates: [
              {
                resolution: "720p",
                workflow: "GENERATE",
                microUsdPerThousandTokens: "10700",
              },
            ],
          },
        },
      ],
    });
    const response = await POST(
      request({ resolution: "720p", aspectRatio: "16:9", durationSeconds: 5 }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.quote.estimatedCredits).toBe("594");
    expect(body.quote.estimatedUsage.quantity).toBe("108000");
    expect(body.quote.estimationPolicy).toBe("byteplus-video-v1");
    expect(BigInt(body.quote.reservationCredits)).toBeGreaterThan(594n);
    expect(mocks.budget).toHaveBeenCalledWith(
      expect.objectContaining({
        proposedCredits: BigInt(body.quote.reservationCredits),
      }),
    );
  });
  it("reports text-token-v1 for external text quotes without BytePlus labeling", async () => {
    mocks.db.providerModel.findFirst.mockResolvedValue({
      ...model,
      provider: "GROQ",
      mediaKind: "TEXT",
      providerModelId: "openai/gpt-oss-20b",
      displayName: "GPT-OSS 20B",
      capabilities: {
        contextWindow: 131072,
        scriptwriting: true,
      },
      priceVersions: [
        {
          ...price,
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
        },
      ],
    });
    const response = await POST(request({ text: "abcd", units: 1000 }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.quote.estimationPolicy).toBe("text-token-v1");
    expect(body.quote.estimatedUsage.unit).toBe("TOKEN");
    expect(body.quote.settlement).toBe("ACTUAL_USAGE");
    expect(body.quote.customerCredits).toBe(body.quote.reservationCredits);
  });

  it("rejects unauthorized boundaries and unsupported parameters", async () => {
    expect((await POST(request({ units: 16 }))).status).toBe(400);
    expect((await POST(request({ resolution: "4K" }))).status).toBe(400);
    mocks.trusted.mockReturnValue(false);
    expect((await POST(request())).status).toBe(403);
    mocks.trusted.mockReturnValue(true);
    mocks.db.membership.findUnique.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(404);
  });
});
