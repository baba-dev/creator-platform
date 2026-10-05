import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  trusted: vi.fn(),
  session: vi.fn(),
  createImageJob: vi.fn(),
  db: {
    membership: {
      findUnique: vi.fn(),
    },
    chatThread: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    chatMessage: {
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    generationJob: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/request-security", () => ({
  hasTrustedMutationOrigin: mocks.trusted,
}));

vi.mock("@/lib/request-auth", () => ({
  getRequestSession: mocks.session,
}));

vi.mock("@aiwa/generation", () => ({
  createImageJob: mocks.createImageJob,
  createVideoJob: vi.fn(),
  createVoiceJob: vi.fn(),
}));

vi.mock("@/lib/conversations/title-generator", () => ({
  deriveDeterministicTitle: vi
    .fn()
    .mockReturnValue("Luxury Perfume Desert Shoot"),
  generateConversationTitle: vi.fn().mockResolvedValue("Omani Perfume Shoot"),
}));

vi.mock("@aiwa/db", () => ({
  db: mocks.db,
}));

import { POST } from "./route";

const fakeUser = {
  id: "user_1",
  name: "Creator User",
  email: "user@example.com",
};
const fakeMembership = {
  id: "mem_1",
  role: "ORGANIZATION_MEMBER",
  organization: { id: "org_1", status: "ACTIVE" },
};

describe("POST /api/conversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.trusted.mockReturnValue(true);
    mocks.session.mockResolvedValue({ user: fakeUser });
    mocks.db.membership.findUnique.mockResolvedValue(fakeMembership);
    mocks.db.chatThread.create.mockResolvedValue({
      id: "conv_100",
      title: "New creation",
    });
    mocks.db.chatMessage.create.mockResolvedValue({ id: "msg_100" });
    mocks.db.chatMessage.upsert.mockResolvedValue({ id: "msg_100" });
    mocks.createImageJob.mockResolvedValue({
      id: "job_img_100",
      status: "QUEUED",
    });
    mocks.db.generationJob.findUnique.mockResolvedValue({ chatThreadId: null });
    mocks.db.generationJob.update.mockResolvedValue({});
    mocks.db.generationJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.db.chatThread.update.mockResolvedValue({});
    mocks.db.chatThread.delete.mockResolvedValue({});
    mocks.db.chatThread.findFirst.mockResolvedValue(null);
  });

  it("creates a creative conversation and submits first generation job", async () => {
    const req = new Request("https://example.com/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "org_1",
        prompt: "A luxury perfume bottle on desert sand dunes",
        modality: "IMAGE",
        modelId: "seedream-5-0",
        priceVersionId: "pv_1",
        quoteToken: "token_abc",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        aspectRatio: "1:1",
        resolution: "2K",
        outputCount: 1,
      }),
    });

    const res = await POST(req);
    const body = await res.json();
    if (res.status !== 201) {
      console.error("POST /api/conversations failed with body:", body);
    }
    expect(res.status).toBe(201);
    expect(body.conversationId).toBe("conv_100");
    expect(body.jobId).toBe("job_img_100");
    expect(body.title).toBe("Luxury Perfume Desert Shoot");

    // Verify ChatThread created with threadType CREATIVE
    expect(mocks.db.chatThread.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org_1",
          createdById: "user_1",
          threadType: "CREATIVE",
          title: "Luxury Perfume Desert Shoot",
        }),
      }),
    );

    // Verify generation job claimed by exactly one conversation.
    expect(mocks.db.generationJob.updateMany).toHaveBeenCalledWith({
      where: { id: "job_img_100", chatThreadId: null },
      data: { chatThreadId: "conv_100" },
    });
  });

  it("rejects unauthenticated requests with 401", async () => {
    mocks.session.mockResolvedValue(null);

    const req = new Request("https://example.com/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "org_1",
        prompt: "A test prompt",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
