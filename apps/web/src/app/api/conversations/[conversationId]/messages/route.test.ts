import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  trusted: vi.fn(),
  session: vi.fn(),
  createImageJob: vi.fn(),
  createVideoJob: vi.fn(),
  db: {
    membership: {
      findUnique: vi.fn(),
    },
    chatThread: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    chatMessage: {
      create: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    generationJob: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    providerModel: {
      findFirst: vi.fn(),
    },
    asset: {
      findFirst: vi.fn(),
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
  createVideoJob: mocks.createVideoJob,
  createVoiceJob: vi.fn(),
  GenerationError: class GenerationError extends Error {},
  priceCredits: vi.fn(),
}));

vi.mock("@aiwa/credits", () => ({
  createCreditQuote: vi.fn(),
  reserveCreditsForJob: vi.fn(),
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

const fakeThread = {
  id: "conv_1",
  organizationId: "org_1",
  createdById: "user_1",
  title: "Desert Shoot",
  threadType: "CREATIVE",
  modelId: "model_img_1",
  state: {
    activeModality: "IMAGE",
    currentModelId: "model_img_1",
    settings: { aspectRatio: "1:1", resolution: "2K", outputCount: 1 },
    activeOutputs: [
      { index: 1, assetId: "asset_1", mimeType: "image/png" },
      { index: 2, assetId: "asset_2", mimeType: "image/png" },
    ],
  },
  generationJobs: [
    {
      id: "job_prev",
      status: "SUCCEEDED",
      providerModel: {
        id: "model_img_1",
        displayName: "Seedream 5.0",
        mediaKind: "IMAGE",
      },
      requestPayload: {
        prompt: "Luxury perfume on sand",
        aspectRatio: "1:1",
        resolution: "2K",
      },
      assets: [
        { id: "asset_1", mimeType: "image/png", generationOutputIndex: 0 },
        { id: "asset_2", mimeType: "image/png", generationOutputIndex: 1 },
      ],
    },
  ],
};

describe("POST /api/conversations/[conversationId]/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.trusted.mockReturnValue(true);
    mocks.session.mockResolvedValue({ user: fakeUser });
    mocks.db.membership.findUnique.mockResolvedValue(fakeMembership);
    mocks.db.chatThread.findUnique.mockResolvedValue(fakeThread);
    mocks.db.chatMessage.findMany.mockResolvedValue([]);
    mocks.db.chatMessage.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: `msg_${Math.random()}`, ...data }),
    );
    mocks.db.chatMessage.upsert.mockImplementation(({ create }) =>
      Promise.resolve({ id: `msg_${Math.random()}`, ...create }),
    );
    mocks.db.chatThread.update.mockResolvedValue({});
    mocks.db.generationJob.findUnique.mockResolvedValue({
      chatThreadId: null,
      parentGenerationId: null,
    });
    mocks.db.generationJob.update.mockResolvedValue({});
    mocks.db.generationJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.createImageJob.mockResolvedValue({ id: "job_new", status: "QUEUED" });
    mocks.createVideoJob.mockResolvedValue({
      id: "job_vid_new",
      status: "QUEUED",
    });
    mocks.db.providerModel.findFirst.mockResolvedValue({
      id: "model_img_1",
      displayName: "Seedream 5.0",
      mediaKind: "IMAGE",
      priceVersions: [{ id: "pv_1" }],
    });
    mocks.db.asset.findFirst.mockImplementation(({ where }) =>
      Promise.resolve({ id: where.id }),
    );
  });

  it("handles state-only selection: 'Use the second image.' with 0 credits", async () => {
    const req = new Request(
      "https://example.com/api/conversations/conv_1/messages",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Use the second image.",
          idempotencyKey: "22222222-2222-4222-8222-222222222222",
        }),
      },
    );

    const res = await POST(req, {
      params: Promise.resolve({ conversationId: "conv_1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.selectedAssetId).toBe("asset_2");
    expect(mocks.createImageJob).not.toHaveBeenCalled();

    // Verify ChatThread.state updated with activeAssetId
    expect(mocks.db.chatThread.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "conv_1" },
        data: expect.objectContaining({
          state: expect.objectContaining({ activeAssetId: "asset_2" }),
        }),
      }),
    );
  });

  it("handles explicit UI asset selection with 0 credits", async () => {
    const req = new Request(
      "https://example.com/api/conversations/conv_1/messages",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Select asset",
          selectedAssetId: "asset_1",
          idempotencyKey: "55555555-5555-4555-8555-555555555555",
        }),
      },
    );

    const res = await POST(req, {
      params: Promise.resolve({ conversationId: "conv_1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.selectedAssetId).toBe("asset_1");
    expect(mocks.createImageJob).not.toHaveBeenCalled();
    expect(mocks.createVideoJob).not.toHaveBeenCalled();
  });

  it("handles aspect ratio patch: 'Make it 9:16.' and links parentGenerationId", async () => {
    const req = new Request(
      "https://example.com/api/conversations/conv_1/messages",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Make it 9:16.",
          idempotencyKey: "33333333-3333-4333-8333-333333333333",
        }),
      },
    );

    const res = await POST(req, {
      params: Promise.resolve({ conversationId: "conv_1" }),
    });

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.jobId).toBe("job_new");

    // Verify generation job created with aspectRatio: "9:16"
    expect(mocks.createImageJob).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({
        aspectRatio: "9:16",
        prompt: "Luxury perfume on sand", // preserves original prompt!
      }),
    );

    // Verify provenance is claimed exactly once.
    expect(mocks.db.generationJob.updateMany).toHaveBeenCalledWith({
      where: { id: "job_new", chatThreadId: null },
      data: {
        parentGenerationId: "job_prev",
        chatThreadId: "conv_1",
      },
    });
  });

  it("does not rewrite provenance when an idempotent job is already linked", async () => {
    mocks.db.generationJob.findUnique.mockResolvedValue({
      chatThreadId: "conv_1",
      parentGenerationId: "job_prev",
    });

    const req = new Request(
      "https://example.com/api/conversations/conv_1/messages",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Make it 9:16.",
          idempotencyKey: "66666666-6666-4666-8666-666666666666",
        }),
      },
    );

    const res = await POST(req, {
      params: Promise.resolve({ conversationId: "conv_1" }),
    });

    expect(res.status).toBe(202);
    expect(mocks.db.generationJob.updateMany).not.toHaveBeenCalled();
  });

  it("handles ambiguity with clarify response: 'Use the tenth image.'", async () => {
    const req = new Request(
      "https://example.com/api/conversations/conv_1/messages",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Use the tenth image.",
          idempotencyKey: "44444444-4444-4444-8444-444444444444",
        }),
      },
    );

    const res = await POST(req, {
      params: Promise.resolve({ conversationId: "conv_1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clarification).toBeDefined();
    expect(body.clarification.question).toContain("only 2 images");
    expect(mocks.createImageJob).not.toHaveBeenCalled();
  });
});
