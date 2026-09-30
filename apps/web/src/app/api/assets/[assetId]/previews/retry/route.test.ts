import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  membership: vi.fn(),
  trusted: vi.fn(),
  retry: vi.fn(),
  limited: vi.fn(),
}));
vi.mock("@/lib/request-auth", () => ({ getRequestSession: mocks.session }));
vi.mock("@/lib/asset-api", () => ({
  requireAssetMembership: mocks.membership,
}));
vi.mock("@/lib/request-security", () => ({
  hasTrustedMutationOrigin: mocks.trusted,
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ check: mocks.limited }),
}));
vi.mock("@aiwa/assets/media-recovery", async (original) => ({
  ...(await original<typeof import("@aiwa/assets/media-recovery")>()),
  retryMediaTask: mocks.retry,
}));
import { POST } from "./route";
import { MediaRecoveryError } from "@aiwa/assets/media-recovery";
const context = { params: Promise.resolve({ assetId: "asset" }) };
const request = (
  body: unknown = { organizationId: "org", taskId: "task", cycle: 1 },
) =>
  new Request("https://example.com/api/assets/asset/previews/retry", {
    method: "POST",
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.trusted.mockReturnValue(true);
  mocks.session.mockResolvedValue({ user: { id: "user" } });
  mocks.membership.mockResolvedValue({});
  mocks.limited.mockResolvedValue(null);
});
it("rejects untrusted origins, anonymous and viewer access before recovery", async () => {
  mocks.trusted.mockReturnValue(false);
  expect((await POST(request(), context)).status).toBe(403);
  mocks.trusted.mockReturnValue(true);
  mocks.session.mockResolvedValue(null);
  expect((await POST(request(), context)).status).toBe(401);
  mocks.session.mockResolvedValue({ user: { id: "user" } });
  mocks.membership.mockResolvedValue(null);
  expect((await POST(request(), context)).status).toBe(403);
  expect(mocks.retry).not.toHaveBeenCalled();
});
it("validates budgets and binds recovery to the actor, asset, tenant and cycle", async () => {
  expect(
    (
      await POST(
        request({ organizationId: "org", taskId: "task", cycle: 4 }),
        context,
      )
    ).status,
  ).toBe(400);
  expect((await POST(request(), context)).status).toBe(202);
  expect(mocks.retry).toHaveBeenCalledWith("task", false, {
    actorUserId: "user",
    expectedCycle: 1,
    organizationId: "org",
    assetId: "asset",
  });
});
it("reports state conflicts safely and preserves rate-limit responses", async () => {
  mocks.retry.mockRejectedValue(new MediaRecoveryError("STATE_CHANGED"));
  expect((await POST(request(), context)).status).toBe(409);
  mocks.retry.mockClear();
  mocks.limited.mockResolvedValue(new Response(null, { status: 429 }));
  expect((await POST(request(), context)).status).toBe(429);
  expect(mocks.retry).not.toHaveBeenCalled();
});
