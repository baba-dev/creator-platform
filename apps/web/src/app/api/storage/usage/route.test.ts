import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  membership: vi.fn(),
  summary: vi.fn(),
}));
vi.mock("@/lib/request-auth", () => ({ getRequestSession: mocks.session }));
vi.mock("@aiwa/db", () => ({
  db: { membership: { findUnique: mocks.membership } },
}));
vi.mock("@aiwa/assets/storage-summary", () => ({
  getUserStorageSummary: mocks.summary,
}));
vi.mock("@aiwa/config", () => ({
  parseServerEnv: () => ({ ASSET_STORAGE_ROOT: "/tmp" }),
}));
import { GET } from "./route";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "current-user" } });
});
it("requires authentication before looking up storage", async () => {
  mocks.session.mockResolvedValue(null);
  expect(
    (
      await GET(
        new Request("https://app.test/api/storage/usage?organizationId=org"),
      )
    ).status,
  ).toBe(401);
  expect(mocks.summary).not.toHaveBeenCalled();
});
it("rejects other workspaces", async () => {
  mocks.membership.mockResolvedValue(null);
  expect(
    (
      await GET(
        new Request("https://app.test/api/storage/usage?organizationId=other"),
      )
    ).status,
  ).toBe(403);
  expect(mocks.summary).not.toHaveBeenCalled();
});
it("rejects missing organization", async () => {
  expect(
    (await GET(new Request("https://app.test/api/storage/usage"))).status,
  ).toBe(400);
});
it("uses session identity rather than a supplied user and prevents response caching", async () => {
  mocks.membership.mockResolvedValue({ role: "ORGANIZATION_MEMBER" });
  mocks.summary.mockResolvedValue({ pools: [] });
  const response = await GET(
    new Request(
      "https://app.test/api/storage/usage?organizationId=org&userId=other",
    ),
  );
  expect(response.status).toBe(200);
  expect(mocks.summary.mock.calls[0]?.slice(1, 3)).toEqual([
    "org",
    "current-user",
  ]);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
