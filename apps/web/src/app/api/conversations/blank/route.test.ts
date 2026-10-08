import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  session: vi.fn(),
  trusted: vi.fn(),
  limit: vi.fn(),
  membership: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/lib/request-auth", () => ({ getRequestSession: mock.session }));
vi.mock("@/lib/request-security", () => ({
  hasTrustedMutationOrigin: mock.trusted,
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ check: mock.limit }),
}));
vi.mock("@aiwa/db", () => ({
  db: {
    membership: { findUnique: mock.membership },
    chatThread: { create: mock.create },
  },
}));
import { POST } from "./route";

describe("blank creative conversation start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.trusted.mockReturnValue(true);
    mock.limit.mockResolvedValue(null);
    mock.session.mockResolvedValue({ user: { id: "u_1" } });
    mock.membership.mockResolvedValue({
      organizationId: "org_1",
      role: "ORGANIZATION_OWNER",
      organization: { status: "ACTIVE" },
    });
    mock.create.mockResolvedValue({
      id: "thread_1",
      title: "New conversation",
    });
  });

  it("does not reserve credits or create a generation job", async () => {
    const res = await POST(
      new Request("https://example.com/api/conversations/blank", {
        method: "POST",
        body: JSON.stringify({ organizationId: "org_1" }),
      }),
    );
    expect(res.status).toBe(201);
    expect(mock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          threadType: "CREATIVE",
          state: expect.objectContaining({ currentModelId: null }),
        }),
      }),
    );
  });

  it("rejects unauthenticated and cross-organization starts", async () => {
    mock.session.mockResolvedValueOnce(null);
    const makeRequest = () =>
      new Request("https://example.com/api/conversations/blank", {
        method: "POST",
        body: JSON.stringify({ organizationId: "org_1" }),
      });
    expect((await POST(makeRequest())).status).toBe(401);
    mock.membership.mockResolvedValueOnce(null);
    expect((await POST(makeRequest())).status).toBe(403);
    expect(mock.create).not.toHaveBeenCalled();
  });
});
