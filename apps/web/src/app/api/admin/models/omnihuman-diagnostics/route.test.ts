import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  origin: vi.fn(),
  session: vi.fn(),
  diagnose: vi.fn(),
}));
vi.mock("@/lib/request-security", () => ({
  hasTrustedMutationOrigin: mocks.origin,
}));
vi.mock("@/lib/request-auth", () => ({ getRequestSession: mocks.session }));
vi.mock("@aiwa/providers/byteplus", () => ({
  diagnoseOmniHumanVision: mocks.diagnose,
}));
import { POST } from "./route";
const request = () =>
  new Request("https://example.com/api/admin/models/omnihuman-diagnostics", {
    method: "POST",
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.origin.mockReturnValue(true);
});
describe("OmniHuman diagnostic authorization", () => {
  it("rejects foreign origins before checking credentials", async () => {
    mocks.origin.mockReturnValue(false);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.diagnose).not.toHaveBeenCalled();
  });
  it("rejects anonymous requests", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect(mocks.diagnose).not.toHaveBeenCalled();
  });
  it("rejects users without model management permission", async () => {
    mocks.session.mockResolvedValue({ user: { platformRole: "USER" } });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.diagnose).not.toHaveBeenCalled();
  });
  it("returns uncached diagnostics for a platform owner", async () => {
    mocks.session.mockResolvedValue({
      user: { platformRole: "PLATFORM_ADMIN" },
    });
    mocks.diagnose.mockResolvedValue({ status: "verified" });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      diagnostics: { status: "verified" },
    });
  });
});
