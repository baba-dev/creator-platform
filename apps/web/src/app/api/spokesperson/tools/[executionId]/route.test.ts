import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  requireMembership: vi.fn(),
  db: { providerToolExecution: { findUnique: vi.fn() } },
}));

vi.mock("@/lib/request-auth", () => ({ getRequestSession: mocks.session }));
vi.mock("@aiwa/db", () => ({ db: mocks.db }));
vi.mock("@aiwa/generation", () => ({
  requireMembership: mocks.requireMembership,
}));

import { GET } from "./route";

const request = new Request(
  "https://example.com/api/spokesperson/tools/execution-1",
);

function context(executionId = "execution-1") {
  return { params: Promise.resolve({ executionId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "user-1" } });
  mocks.requireMembership.mockResolvedValue({
    id: "membership-1",
    role: "MEMBER",
  });
  mocks.db.providerToolExecution.findUnique.mockResolvedValue({
    id: "execution-1",
    organizationId: "org-1",
    createdById: "user-1",
    status: "SUCCEEDED",
    chargedCredits: 7n,
    reservedCredits: 7n,
    errorCode: null,
    errorMessage: null,
    resultPayload: { vq_score: 72.5 },
    completedAt: new Date("2026-10-07T10:00:00.000Z"),
    providerTool: {
      providerToolId: "assess-video-quality",
      displayName: "Video Quality Assessment",
    },
    outputAssets: [],
  });
});

describe("spokesperson MediaKit execution status", () => {
  it("requires authentication before reading an execution", async () => {
    mocks.session.mockResolvedValue(null);
    const response = await GET(request, context());
    expect(response.status).toBe(401);
    expect(mocks.db.providerToolExecution.findUnique).not.toHaveBeenCalled();
  });

  it("rejects malformed identifiers before persistence", async () => {
    const response = await GET(request, context("../execution-1"));
    expect(response.status).toBe(404);
    expect(mocks.db.providerToolExecution.findUnique).not.toHaveBeenCalled();
  });

  it("hides cross-workspace executions", async () => {
    mocks.requireMembership.mockRejectedValue(new Error("denied"));
    const response = await GET(request, context());
    expect(response.status).toBe(404);
  });

  it("hides another member's execution from non-owners", async () => {
    mocks.db.providerToolExecution.findUnique.mockResolvedValueOnce({
      ...(await mocks.db.providerToolExecution.findUnique()),
      createdById: "user-2",
    });
    const response = await GET(request, context());
    expect(response.status).toBe(404);
  });

  it("returns bounded customer-safe execution details", async () => {
    const response = await GET(request, context());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      execution: {
        id: "execution-1",
        tool: "assess-video-quality",
        displayName: "Video Quality Assessment",
        status: "SUCCEEDED",
        chargedCredits: "7",
        reservedCredits: "7",
        errorCode: null,
        errorMessage: null,
        vqScore: 72.5,
        outputAssetId: null,
        outputMimeType: null,
        completedAt: "2026-10-07T10:00:00.000Z",
      },
    });
  });
});
