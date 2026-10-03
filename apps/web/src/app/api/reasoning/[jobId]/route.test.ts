import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  reasoningFind: vi.fn(),
  membership: vi.fn(),
  hasOrg: vi.fn(),
  hasPlatform: vi.fn(),
}));

vi.mock("@/lib/request-auth", () => ({
  getRequestSession: mocks.session,
}));
vi.mock("@aiwa/authz", () => ({
  hasOrganizationPermission: mocks.hasOrg,
  hasPlatformPermission: mocks.hasPlatform,
}));
vi.mock("@aiwa/db", () => ({
  db: {
    reasoningJob: { findUnique: mocks.reasoningFind },
    membership: { findUnique: mocks.membership },
  },
}));

import { GET } from "./route";

const job = {
  id: "reason-job-1",
  organizationId: "org-1",
  createdById: "user-1",
  providerModelId: "model-1",
  priceVersionId: "price-1",
  status: "SUCCEEDED",
  outputPayload: { enhancedPrompt: "Cinematic desert sunrise" },
  providerRequestId: "groq-request-1",
  inputTokens: 100,
  outputTokens: 50,
  estimatedProviderCostMicroUsd: 500n,
  actualProviderCostMicroUsd: 200n,
  providerCostBasis: "PROVIDER_USAGE",
  errorCode: null,
  errorMessage: null,
  createdAt: new Date("2026-10-03T10:00:00Z"),
  completedAt: new Date("2026-10-03T10:00:01Z"),
  providerModel: {
    id: "model-1",
    provider: "GROQ",
    providerModelId: "openai/gpt-oss-120b",
    displayName: "GPT-OSS 120B",
  },
};

function request() {
  return new Request("https://example.com/api/reasoning/reason-job-1");
}

const context = { params: Promise.resolve({ jobId: "reason-job-1" }) };

describe("reasoning status provenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({
      user: { id: "user-1", platformRole: "USER" },
    });
    mocks.reasoningFind.mockResolvedValue(job);
    mocks.membership.mockResolvedValue({
      role: "ORGANIZATION_MEMBER",
      organization: { status: "ACTIVE" },
    });
    mocks.hasOrg.mockReturnValue(true);
    mocks.hasPlatform.mockReturnValue(false);
  });

  it("shows the exact provider/model used without exposing commercial costs", async () => {
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.model).toEqual({
      id: "model-1",
      provider: "GROQ",
      providerModelId: "openai/gpt-oss-120b",
      name: "GPT-OSS 120B",
    });
    expect(body.priceVersionId).toBe("price-1");
    expect(body.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
    expect(body.providerCost).toBeUndefined();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("exposes provider cost observability only to finance-capable platform roles", async () => {
    mocks.session.mockResolvedValue({
      user: { id: "user-1", platformRole: "FINANCE_ADMIN" },
    });
    mocks.hasPlatform.mockReturnValue(true);

    const body = await (await GET(request(), context)).json();
    expect(body.providerCost).toEqual({
      estimatedMicroUsd: "500",
      actualMicroUsd: "200",
      basis: "PROVIDER_USAGE",
    });
  });

  it("requires both creator identity and current workspace access", async () => {
    mocks.session.mockResolvedValue({
      user: { id: "another-user", platformRole: "PLATFORM_OWNER" },
    });
    expect((await GET(request(), context)).status).toBe(404);

    mocks.session.mockResolvedValue({
      user: { id: "user-1", platformRole: "USER" },
    });
    mocks.hasOrg.mockReturnValue(false);
    expect((await GET(request(), context)).status).toBe(404);
  });
});
