import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  origin: vi.fn(),
  configured: vi.fn(),
  prepare: vi.fn(),
  create: vi.fn(),
  check: vi.fn(),
}));
vi.mock("@/lib/request-auth", () => ({ getRequestSession: mocks.session }));
vi.mock("@/lib/request-security", () => ({
  hasTrustedMutationOrigin: mocks.origin,
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ check: mocks.check }),
}));
vi.mock("@aiwa/providers/byteplus", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  isBytePlusMediaKitConfigured: mocks.configured,
}));
vi.mock("@aiwa/generation/media-tools", async (original) => {
  const actual = await original<Record<string, unknown>>();
  return {
    ...actual,
    prepareMediaToolRequest: mocks.prepare,
    createProviderToolExecution: mocks.create,
  };
});
import { POST } from "./route";
const body = {
  organizationId: "org",
  toolKey: "crop-image",
  assetIds: ["image"],
  input: { crop_width: 100, crop_height: 100 },
  action: "quote",
};
const prepared = {
  organizationId: "org",
  toolId: "tool",
  priceVersionId: "price",
  quotedQuantity: 1000,
  reservedCredits: "2",
  input: body.input,
  sourceAssets: [{ assetId: "image", role: "SOURCE_IMAGE", position: 0 }],
};
function request(input: unknown) {
  return new Request("https://example.com/api/media-tools", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "user" } });
  mocks.origin.mockReturnValue(true);
  mocks.configured.mockReturnValue(true);
  mocks.check.mockResolvedValue(null);
  mocks.prepare.mockResolvedValue(prepared);
  mocks.create.mockResolvedValue({ id: "execution", status: "QUEUED" });
});
describe("MediaKit quote acceptance", () => {
  it("rejects untrusted origins before admission", async () => {
    mocks.origin.mockReturnValue(false);
    expect((await POST(request(body))).status).toBe(403);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("requires authentication", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await POST(request(body))).status).toBe(401);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("quotes without creating a billable execution", async () => {
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    expect((await response.json()).quote.reservedCredits).toBe("2");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects a changed price or edited reservation before committing work", async () => {
    for (const change of [
      { priceVersionId: "old-price", reservedCredits: "2" },
      { priceVersionId: "price", reservedCredits: "1" },
    ]) {
      expect(
        (
          await POST(
            request({
              ...body,
              action: "execute",
              idempotencyKey: "50a49a7b-b2f4-4cf4-8050-e167710996d6",
              ...change,
            }),
          )
        ).status,
      ).toBe(409);
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("passes the accepted server snapshot and stable request key to admission", async () => {
    const idempotencyKey = "50a49a7b-b2f4-4cf4-8050-e167710996d6";
    const response = await POST(
      request({
        ...body,
        action: "execute",
        priceVersionId: "price",
        reservedCredits: "2",
        idempotencyKey,
      }),
    );
    expect(response.status).toBe(202);
    expect(mocks.create).toHaveBeenCalledWith("user", {
      organizationId: "org",
      toolId: "tool",
      priceVersionId: "price",
      quotedQuantity: 1000,
      input: body.input,
      sourceAssets: prepared.sourceAssets,
      idempotencyKey,
    });
  });
});
