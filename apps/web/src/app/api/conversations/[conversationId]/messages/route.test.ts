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
      findMany: vi.fn(),
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
    mocks.db.chatThread.findUnique.mockImplementation(() =>
      Promise.resolve(structuredClone(fakeThread)),
    );
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
      providerModelId: "seedream-5-0-260128",
      displayName: "Seedream 5.0",
      provider: "BYTEPLUS",
      mediaKind: "IMAGE",
      capabilities: {
        "aspectRatio:1:1": true,
        "aspectRatio:9:16": true,
        "aspectRatio:16:9": true,
        "resolution:2K": true,
        referenceImages: true,
        sequentialImages: true,
        maxGeneratedImages: 15,
        maxTotalInputOutputImages: 15,
      },
      priceVersions: [{ id: "pv_1" }],
    });
    mocks.db.providerModel.findMany.mockImplementation(({ where }) => {
      if (where.mediaKind === "VIDEO") {
        return Promise.resolve([
          {
            id: "model_avatar_1",
            providerModelId: "omnihuman-1.5",
            displayName: "OmniHuman 1.5",
            provider: "BYTEPLUS",
            mediaKind: "VIDEO",
            capabilities: {
              "aspectRatio:adaptive": true,
              "resolution:720p": true,
              talkingAvatar: true,
              returnLastFrame: false,
            },
            priceVersions: [{ id: "pv_avatar" }],
          },
          {
            id: "model_vid_fast",
            providerModelId: "dreamina-seedance-2-0-fast-260128",
            displayName: "Seedance 2.0 Fast",
            provider: "BYTEPLUS",
            mediaKind: "VIDEO",
            capabilities: {
              "aspectRatio:adaptive": true,
              "resolution:720p": true,
              firstFrame: true,
              returnLastFrame: true,
            },
            priceVersions: [{ id: "pv_video_fast" }],
          },
        ]);
      }
      return Promise.resolve([
        {
          id: "model_img_legacy",
          providerModelId: "seedream-4-0-250828",
          displayName: "Seedream 4.0",
          provider: "BYTEPLUS",
          mediaKind: "IMAGE",
          capabilities: {
            "aspectRatio:1:1": true,
            "aspectRatio:9:16": true,
            "aspectRatio:16:9": true,
            "resolution:2K": true,
            referenceImages: true,
            sequentialImages: true,
            maxGeneratedImages: 15,
            maxTotalInputOutputImages: 15,
          },
          priceVersions: [{ id: "pv_legacy" }],
        },
        {
          id: "model_img_1",
          providerModelId: "seedream-5-0-260128",
          displayName: "Seedream 5.0",
          provider: "BYTEPLUS",
          mediaKind: "IMAGE",
          capabilities: {
            "aspectRatio:1:1": true,
            "aspectRatio:9:16": true,
            "aspectRatio:16:9": true,
            "resolution:2K": true,
            referenceImages: true,
            sequentialImages: true,
            maxGeneratedImages: 15,
            maxTotalInputOutputImages: 15,
          },
          priceVersions: [{ id: "pv_1" }],
        },
        {
          id: "model_img_45",
          providerModelId: "seedream-4-5-251128",
          displayName: "Seedream 4.5",
          provider: "BYTEPLUS",
          mediaKind: "IMAGE",
          capabilities: {
            "aspectRatio:1:1": true,
            "aspectRatio:9:16": true,
            "aspectRatio:16:9": true,
            "resolution:2K": true,
            referenceImages: true,
            sequentialImages: true,
            maxGeneratedImages: 15,
            maxTotalInputOutputImages: 15,
          },
          priceVersions: [{ id: "pv_45" }],
        },
      ]);
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

  it("preserves the focused image when changing aspect ratio from a quick action", async () => {
    const req = new Request(
      "https://example.com/api/conversations/conv_1/messages",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Make it 9:16.",
          selectedAssetId: "asset_1",
          idempotencyKey: "88888888-8888-4888-8888-888888888888",
        }),
      },
    );

    const res = await POST(req, {
      params: Promise.resolve({ conversationId: "conv_1" }),
    });

    expect(res.status).toBe(202);
    expect(mocks.createImageJob).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({
        aspectRatio: "9:16",
        prompt: "Luxury perfume on sand",
        referenceAssetIds: ["asset_1"],
      }),
    );
  });

  it("creates four focused variations from the selected image", async () => {
    const req = new Request(
      "https://example.com/api/conversations/conv_1/messages",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Give me four variations",
          selectedAssetId: "asset_1",
          idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        }),
      },
    );

    const res = await POST(req, {
      params: Promise.resolve({ conversationId: "conv_1" }),
    });

    expect(res.status).toBe(202);
    expect(mocks.createImageJob).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({
        modelId: "model_img_1",
        outputCount: 4,
        referenceAssetIds: ["asset_1"],
        prompt: "Luxury perfume on sand",
      }),
    );
  });

  it("applies cinematic-lighting quick action as an edit of the focused image", async () => {
    const req = new Request(
      "https://example.com/api/conversations/conv_1/messages",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Enhance with dramatic cinematic lighting and high contrast",
          selectedAssetId: "asset_1",
          idempotencyKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        }),
      },
    );

    const res = await POST(req, {
      params: Promise.resolve({ conversationId: "conv_1" }),
    });

    expect(res.status).toBe(202);
    expect(mocks.createImageJob).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({
        modelId: "model_img_1",
        prompt: "Enhance with dramatic cinematic lighting and high contrast",
        referenceAssetIds: ["asset_1"],
      }),
    );
  });

  it("Try another model uses deterministic safe image-model preference", async () => {
    mocks.db.providerModel.findFirst.mockResolvedValue({
      id: "model_img_45",
      providerModelId: "seedream-4-5-251128",
      displayName: "Seedream 4.5",
      provider: "BYTEPLUS",
      mediaKind: "IMAGE",
      capabilities: {
        "aspectRatio:1:1": true,
        "resolution:2K": true,
        referenceImages: true,
      },
      priceVersions: [{ id: "pv_45" }],
    });

    const req = new Request(
      "https://example.com/api/conversations/conv_1/messages",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Try another model",
          selectedAssetId: "asset_1",
          idempotencyKey: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        }),
      },
    );

    const res = await POST(req, {
      params: Promise.resolve({ conversationId: "conv_1" }),
    });

    expect(res.status).toBe(202);
    expect(mocks.createImageJob).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({
        modelId: "model_img_45",
        prompt: "Luxury perfume on sand",
      }),
    );
  });

  it("routes Animate this to Seedance and never to the talking-avatar model", async () => {
    mocks.db.providerModel.findFirst.mockResolvedValue({
      id: "model_vid_fast",
      providerModelId: "dreamina-seedance-2-0-fast-260128",
      displayName: "Seedance 2.0 Fast",
      provider: "BYTEPLUS",
      mediaKind: "VIDEO",
      capabilities: {
        "aspectRatio:adaptive": true,
        "resolution:720p": true,
        firstFrame: true,
        returnLastFrame: true,
      },
      priceVersions: [{ id: "pv_video_fast" }],
    });

    const req = new Request(
      "https://example.com/api/conversations/conv_1/messages",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Animate this",
          selectedAssetId: "asset_1",
          idempotencyKey: "99999999-9999-4999-8999-999999999999",
        }),
      },
    );

    const res = await POST(req, {
      params: Promise.resolve({ conversationId: "conv_1" }),
    });

    expect(res.status).toBe(202);
    expect(mocks.createVideoJob).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({
        modelId: "model_vid_fast",
        workflow: "FRAME_TO_VIDEO",
        aspectRatio: "adaptive",
        resolution: "720p",
        returnLastFrame: true,
        sources: [
          {
            assetId: "asset_1",
            role: "FIRST_FRAME",
            position: 0,
          },
        ],
      }),
    );
  });

  it("retries frame-to-video with its original first-frame source", async () => {
    const videoThread = {
      ...structuredClone(fakeThread),
      modelId: "model_vid_1",
      state: {
        activeModality: "VIDEO",
        currentModelId: "model_vid_1",
        settings: {
          aspectRatio: "adaptive",
          resolution: "720p",
          durationSeconds: 5,
        },
        activeOutputs: [],
      },
      generationJobs: [
        {
          id: "job_video_prev",
          status: "SUCCEEDED",
          providerModel: {
            id: "model_vid_1",
            displayName: "Seedance",
            mediaKind: "VIDEO",
          },
          requestPayload: {
            schemaVersion: 2,
            workflow: "FRAME_TO_VIDEO",
            prompt: "Animate the product",
            sources: [
              {
                assetId: "asset_1",
                role: "FIRST_FRAME",
                position: 0,
              },
            ],
            aspectRatio: "adaptive",
            resolution: "720p",
            durationSeconds: 5,
            generateAudio: false,
            outputFormat: "mp4",
            returnLastFrame: true,
          },
          assets: [
            {
              id: "video_out",
              mimeType: "video/mp4",
              generationOutputIndex: 0,
            },
          ],
        },
      ],
    };
    mocks.db.chatThread.findUnique.mockResolvedValue(videoThread);
    mocks.db.providerModel.findFirst.mockResolvedValue({
      id: "model_vid_1",
      displayName: "Seedance",
      mediaKind: "VIDEO",
      priceVersions: [{ id: "pv_video_1" }],
    });

    const req = new Request(
      "https://example.com/api/conversations/conv_1/messages",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "retry",
          idempotencyKey: "77777777-7777-4777-8777-777777777777",
        }),
      },
    );

    const res = await POST(req, {
      params: Promise.resolve({ conversationId: "conv_1" }),
    });

    expect(res.status).toBe(202);
    expect(mocks.createVideoJob).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({
        workflow: "FRAME_TO_VIDEO",
        prompt: "Animate the product",
        aspectRatio: "adaptive",
        resolution: "720p",
        sources: [
          {
            assetId: "asset_1",
            role: "FIRST_FRAME",
            position: 0,
          },
        ],
      }),
    );
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

  it("resumes original action from pending clarification when asset is selected", async () => {
    const threadWithPending = {
      ...structuredClone(fakeThread),
      state: {
        ...fakeThread.state,
        pendingOperation: {
          originalPrompt: "Animate this",
          createdAt: new Date().toISOString(),
        },
      },
    };
    mocks.db.chatThread.findUnique.mockResolvedValue(threadWithPending);
    mocks.db.providerModel.findFirst.mockResolvedValue({
      id: "model_vid_1",
      displayName: "Seedance",
      mediaKind: "VIDEO",
      priceVersions: [{ id: "pv_video_1" }],
    });

    const req = new Request(
      "https://example.com/api/conversations/conv_1/messages",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Select asset",
          selectedAssetId: "asset_2",
          idempotencyKey: "55555555-5555-4555-8555-555555555555",
        }),
      },
    );

    const res = await POST(req, {
      params: Promise.resolve({ conversationId: "conv_1" }),
    });

    expect(res.status).toBe(202);
    expect(mocks.createVideoJob).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({
        workflow: "FRAME_TO_VIDEO",
        sources: [
          {
            assetId: "asset_2",
            role: "FIRST_FRAME",
            position: 0,
          },
        ],
      }),
    );
  });

  it("increments revision in thread state on state updates", async () => {
    const req = new Request(
      "https://example.com/api/conversations/conv_1/messages",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "A futuristic hovercraft",
          idempotencyKey: "66666666-6666-4666-8666-666666666666",
        }),
      },
    );

    const res = await POST(req, {
      params: Promise.resolve({ conversationId: "conv_1" }),
    });

    expect(res.status).toBe(202);
    expect(mocks.db.chatThread.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "conv_1" },
        data: expect.objectContaining({
          state: expect.objectContaining({
            revision: 1,
          }),
        }),
      }),
    );
  });
});
