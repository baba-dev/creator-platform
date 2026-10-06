import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  trusted: vi.fn(),
  session: vi.fn(),
  db: {
    membership: {
      findUnique: vi.fn(),
    },
    chatThread: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    chatMessage: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/request-security", () => ({
  hasTrustedMutationOrigin: mocks.trusted,
}));

vi.mock("@/lib/request-auth", () => ({
  getRequestSession: mocks.session,
}));

vi.mock("@aiwa/db", () => ({
  db: mocks.db,
}));

import { GET, PATCH, DELETE } from "./route";

const fakeUser = {
  id: "user_1",
  name: "Creator User",
  email: "user@example.com",
};

const fakeMembership = {
  id: "mem_1",
  role: "ORGANIZATION_OWNER",
  organization: { id: "org_1", status: "ACTIVE" },
};

describe("GET /api/conversations/[conversationId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.trusted.mockReturnValue(true);
    mocks.session.mockResolvedValue({ user: fakeUser });
    mocks.db.membership.findUnique.mockResolvedValue(fakeMembership);
  });

  it("safely serializes Prisma BigInt credit fields and returns valid JSON DTO", async () => {
    const fakeThreadWithBigIntJobs = {
      id: "conv_123",
      organizationId: "org_1",
      createdById: "user_1",
      title: "Desert Sunset",
      threadType: "CREATIVE",
      state: {
        activeModality: "IMAGE",
        currentModelId: "model_1",
        settings: { aspectRatio: "16:9" },
      },
      createdAt: new Date("2026-10-01T10:00:00Z"),
      updatedAt: new Date("2026-10-01T10:05:00Z"),
      generationJobs: [
        {
          id: "job_succeeded",
          status: "SUCCEEDED",
          errorCode: null,
          errorMessage: null,
          createdAt: new Date("2026-10-01T10:01:00Z"),
          reservedCredits: 10n,
          chargedCredits: 10n,
          actualProviderCostMicroUsd: 150000n,
          assets: [
            {
              id: "asset_1",
              mimeType: "image/png",
              generationOutputIndex: 0,
              width: 1920,
              height: 1080,
              durationMs: null,
            },
            {
              id: "asset_2",
              mimeType: "image/png",
              generationOutputIndex: 1,
              width: 1920,
              height: 1080,
              durationMs: null,
            },
          ],
          providerModel: {
            id: "model_1",
            provider: "BYTEPLUS",
            displayName: "Seedream 5.0",
            mediaKind: "IMAGE",
          },
        },
        {
          id: "job_failed",
          status: "FAILED",
          errorCode: "PROVIDER_TIMEOUT",
          errorMessage: "Provider timed out while processing request.",
          createdAt: new Date("2026-10-01T10:02:00Z"),
          reservedCredits: 5n,
          chargedCredits: 0n,
          actualProviderCostMicroUsd: null,
          assets: [],
          providerModel: {
            id: "model_2",
            provider: "BYTEPLUS",
            displayName: "Seedance 2.0",
            mediaKind: "VIDEO",
          },
        },
      ],
    };

    mocks.db.chatThread.findUnique.mockResolvedValue(fakeThreadWithBigIntJobs);
    mocks.db.chatMessage.findMany.mockResolvedValue([
      {
        id: "msg_2",
        threadId: "conv_123",
        role: "assistant",
        content: "Generating image with Seedream 5.0...",
        createdAt: new Date("2026-10-01T10:00:35Z"),
        metadata: { turnStatus: "COMPLETED" },
      },
      {
        id: "msg_1",
        threadId: "conv_123",
        role: "user",
        content: "Create a desert sunset",
        createdAt: new Date("2026-10-01T10:00:30Z"),
        metadata: null,
      },
    ]);

    const req = new Request("https://example.com/api/conversations/conv_123");
    const res = await GET(req, {
      params: Promise.resolve({ conversationId: "conv_123" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.conversation).toBeDefined();
    expect(body.conversation.id).toBe("conv_123");
    expect(body.conversation.generationJobs).toHaveLength(2);

    const succeededJob = body.conversation.generationJobs[0];
    expect(succeededJob.id).toBe("job_succeeded");
    expect(succeededJob.reservedCredits).toBe("10");
    expect(succeededJob.chargedCredits).toBe("10");
    expect(succeededJob.actualProviderCostMicroUsd).toBeUndefined();
    expect(succeededJob.assets).toHaveLength(2);

    const failedJob = body.conversation.generationJobs[1];
    expect(failedJob.id).toBe("job_failed");
    expect(failedJob.reservedCredits).toBe("5");
    expect(failedJob.chargedCredits).toBe("0");
    expect(failedJob.actualProviderCostMicroUsd).toBeUndefined();
    expect(failedJob.errorCode).toBe("PROVIDER_TIMEOUT");
    expect(failedJob.assets).toHaveLength(0);

    expect(body.conversation.messages).toHaveLength(2);
    expect(body.conversation.messages[0].role).toBe("user");
    expect(body.conversation.messages[1].role).toBe("assistant");
  });

  it("returns 401 if unauthenticated", async () => {
    mocks.session.mockResolvedValue(null);
    const req = new Request("https://example.com/api/conversations/conv_123");
    const res = await GET(req, {
      params: Promise.resolve({ conversationId: "conv_123" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 if conversation belongs to another user", async () => {
    mocks.db.chatThread.findUnique.mockResolvedValue({
      id: "conv_foreign",
      threadType: "CREATIVE",
      createdById: "other_user",
    });
    const req = new Request(
      "https://example.com/api/conversations/conv_foreign",
    );
    const res = await GET(req, {
      params: Promise.resolve({ conversationId: "conv_foreign" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/conversations/[conversationId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.trusted.mockReturnValue(true);
    mocks.session.mockResolvedValue({ user: fakeUser });
    mocks.db.membership.findUnique.mockResolvedValue(fakeMembership);
    mocks.db.chatThread.findUnique.mockResolvedValue({
      id: "conv_123",
      organizationId: "org_1",
      createdById: "user_1",
      threadType: "CREATIVE",
    });
  });

  it("updates conversation title", async () => {
    mocks.db.chatThread.update.mockResolvedValue({
      id: "conv_123",
      title: "New Title",
      state: {},
      updatedAt: new Date(),
    });

    const req = new Request("https://example.com/api/conversations/conv_123", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New Title" }),
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ conversationId: "conv_123" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.conversation.title).toBe("New Title");
  });

  it("rejects untrusted mutation origin", async () => {
    mocks.trusted.mockReturnValue(false);
    const req = new Request("https://example.com/api/conversations/conv_123", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New Title" }),
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ conversationId: "conv_123" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/conversations/[conversationId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.trusted.mockReturnValue(true);
    mocks.session.mockResolvedValue({ user: fakeUser });
    mocks.db.membership.findUnique.mockResolvedValue(fakeMembership);
    mocks.db.chatThread.findUnique.mockResolvedValue({
      id: "conv_123",
      organizationId: "org_1",
      createdById: "user_1",
      threadType: "CREATIVE",
    });
    mocks.db.chatThread.delete.mockResolvedValue({});
  });

  it("deletes the conversation", async () => {
    const req = new Request("https://example.com/api/conversations/conv_123", {
      method: "DELETE",
    });
    const res = await DELETE(req, {
      params: Promise.resolve({ conversationId: "conv_123" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
