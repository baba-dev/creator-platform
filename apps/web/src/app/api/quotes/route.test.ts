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
    expect(BigInt(body.quote.reservationCredits)).toBeGreaterThan(594n);
    expect(mocks.budget).toHaveBeenCalledWith(
      expect.objectContaining({
        proposedCredits: BigInt(body.quote.reservationCredits),
      }),
    );
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
