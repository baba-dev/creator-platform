import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  trusted: vi.fn(),
  permitted: vi.fn(),
  membership: vi.fn(),
  discover: vi.fn(),
  preference: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/request-auth", () => ({ getRequestSession: mocks.session }));
vi.mock("@/lib/request-security", () => ({ hasTrustedMutationOrigin: mocks.trusted }));
vi.mock("@aiwa/authz", () => ({ hasOrganizationPermission: mocks.permitted }));
vi.mock("@/lib/studio-model-discovery", () => ({ getAvailableStudioModels: mocks.discover }));
vi.mock("@aiwa/db", () => ({
  db: {
    membership: { findUnique: mocks.membership },
    promptEnhancementPreference: {
      findUnique: mocks.preference,
      upsert: mocks.upsert,
      deleteMany: mocks.deleteMany,
    },
    auditEvent: { create: mocks.audit },
  },
}));

import { GET, PATCH } from "./route";

const org = "org-1";
const endpoint = `https://example.com/api/account/prompt-enhancement-model?organizationId=${org}`;
function patch(modelId: string | null, organizationId = org) {
  return new Request(endpoint, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizationId, modelId }),
  });
}

describe("Prompt Enhance model preferences", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.trusted.mockReturnValue(true);
    mocks.permitted.mockReturnValue(true);
    mocks.membership.mockResolvedValue({ role: "ORGANIZATION_MEMBER", organization: { status: "ACTIVE" } });
    mocks.discover.mockResolvedValue({
      defaultModelId: "eligible-a",
      models: [{ id: "eligible-a" }, { id: "eligible-b" }],
    });
    mocks.preference.mockResolvedValue(null);
    mocks.upsert.mockResolvedValue({});
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    mocks.audit.mockResolvedValue({});
  });

  it("rejects requests without a session or active membership", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await GET(new Request(endpoint))).status).toBe(401);
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.membership.mockResolvedValue(null);
    expect((await GET(new Request(endpoint))).status).toBe(404);
    expect(mocks.discover).not.toHaveBeenCalled();
  });

  it("uses the persisted selection and scopes it by user and workspace", async () => {
    mocks.preference.mockResolvedValue({ modelId: "eligible-b" });
    const res = await GET(new Request(endpoint));
    expect(res.status).toBe(200);
    expect((await res.json()).modelId).toBe("eligible-b");
    expect(mocks.preference).toHaveBeenCalledWith({
      where: { organizationId_userId: { organizationId: org, userId: "user-1" } },
      select: { modelId: true },
    });
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("safely falls back when a stored model is no longer available", async () => {
    mocks.preference.mockResolvedValue({ modelId: "removed-model" });
    const res = await GET(new Request(endpoint));
    const data = await res.json();
    expect(data.modelId).toBe("eligible-a");
    expect(data.savedModelUnavailable).toBe(true);
  });

  it("rejects invalid or disabled model choices before writing", async () => {
    expect((await PATCH(patch("unavailable"))).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
    mocks.trusted.mockReturnValue(false);
    expect((await PATCH(patch("eligible-b"))).status).toBe(403);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("saves only the requesting member's canonical model ID", async () => {
    const res = await PATCH(patch("eligible-b"));
    expect(res.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { organizationId_userId: { organizationId: org, userId: "user-1" } },
      create: { organizationId: org, userId: "user-1", modelId: "eligible-b" },
      update: { modelId: "eligible-b" },
    });
    expect(mocks.audit).toHaveBeenCalledOnce();
  });

  it("restores the default without deleting another user's selection", async () => {
    const res = await PATCH(patch(null));
    expect((await res.json()).modelId).toBe("eligible-a");
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { organizationId: org, userId: "user-1" } });
  });
});
