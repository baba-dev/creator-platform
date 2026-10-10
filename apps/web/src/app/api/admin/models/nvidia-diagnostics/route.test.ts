import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), findFirst: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/request-auth", () => ({ getRequestSession: mocks.session }));
vi.mock("@aiwa/db", () => ({ db: { providerModel: { findFirst: mocks.findFirst } } }));
vi.mock("@aiwa/providers/nvidia", () => ({ createNvidiaProvider: () => ({ listModels: mocks.list }) }));
import { GET } from "./route";
const url = (id: string) => new Request(`https://example.com/api/admin/models/nvidia-diagnostics?modelId=${encodeURIComponent(id)}`);
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("NVIDIA_API_KEY", "fake-test-key"); mocks.findFirst.mockResolvedValue({ id: "m1" }); });
describe("NVIDIA read-only diagnostics", () => {
  it("rejects unauthenticated callers", async () => { mocks.session.mockResolvedValue(null); expect((await GET(url("deepseek-ai/deepseek-v4.1-flash"))).status).toBe(401); expect(mocks.list).not.toHaveBeenCalled(); });
  it("rejects unauthorized callers", async () => { mocks.session.mockResolvedValue({ user: { platformRole: "USER" } }); expect((await GET(url("deepseek-ai/deepseek-v4.1-flash"))).status).toBe(403); });
  it("returns membership in the provider catalog without inference or credentials", async () => {
    mocks.session.mockResolvedValue({ user: { platformRole: "PLATFORM_ADMIN" } });
    mocks.list.mockResolvedValue(["deepseek-ai/deepseek-v4.1-flash"]);
    const response = await GET(url("deepseek-ai/deepseek-v4.1-flash"));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ status: "listed", requestedModel: { available: true } });
    expect(mocks.list).toHaveBeenCalledOnce();
  });
  it("rejects bad model IDs before any provider call", async () => {
    mocks.session.mockResolvedValue({ user: { platformRole: "PLATFORM_ADMIN" } });
    expect((await GET(url("oops?key=secret"))).status).toBe(400); expect(mocks.list).not.toHaveBeenCalled();
  });
});
