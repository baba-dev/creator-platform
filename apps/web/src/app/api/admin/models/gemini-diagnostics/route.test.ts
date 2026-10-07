import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/request-auth", () => ({ getRequestSession: mocks.session }));
vi.mock("@aiwa/providers/gemini", () => ({
  createGeminiProvider: () => ({ listModels: mocks.list }),
}));
import { GET } from "./route";
const request = () =>
  new Request("https://example.com/api/admin/models/gemini-diagnostics");
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("GEMINI_API_KEY", "test-secret");
});
describe("Gemini model diagnostic", () => {
  it("rejects anonymous requests before calling provider", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("rejects users without model management permission", async () => {
    mocks.session.mockResolvedValue({ user: { platformRole: "USER" } });
    expect((await GET(request())).status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("returns account models without exposing credentials", async () => {
    mocks.session.mockResolvedValue({
      user: { platformRole: "PLATFORM_ADMIN" },
    });
    mocks.list.mockResolvedValue(["gemini-test"]);
    const response = await GET(request());
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      status: "verified",
      models: ["gemini-test"],
    });
  });
  it("does not expose unexpected error details", async () => {
    mocks.session.mockResolvedValue({
      user: { platformRole: "PLATFORM_ADMIN" },
    });
    mocks.list.mockRejectedValue(new Error("secret-value"));
    expect(await (await GET(request())).json()).toEqual({
      status: "provider_rejected",
      code: "DIAGNOSTIC_UNAVAILABLE",
    });
  });
});
