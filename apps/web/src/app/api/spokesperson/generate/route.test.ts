import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  trusted: vi.fn(),
  session: vi.fn(),
  rateLimitCheck: vi.fn(),
  requireMembership: vi.fn(),
  createVideoJob: vi.fn(),
  createVoiceJob: vi.fn(),
  isBytePlusVisionConfigured: vi.fn(),
  isBytePlusVoiceConfigured: vi.fn(),
  db: {
    providerModel: {
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

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ check: mocks.rateLimitCheck }),
}));

vi.mock("@aiwa/generation", () => ({
  requireMembership: mocks.requireMembership,
  createVideoJob: mocks.createVideoJob,
  createVoiceJob: mocks.createVoiceJob,
}));

vi.mock("@aiwa/providers/byteplus", () => ({
  isBytePlusVisionConfigured: mocks.isBytePlusVisionConfigured,
  isBytePlusVoiceConfigured: mocks.isBytePlusVoiceConfigured,
}));

vi.mock("@aiwa/db", () => ({
  db: mocks.db,
}));

import { POST } from "./route";

const fakeSession = {
  user: {
    id: "user-123",
    email: "creator@example.com",
    name: "Creator",
  },
};

const fakeOmniModel = {
  id: "omni-model-db-id",
  providerModelId: "omnihuman-1.5",
  displayName: "OmniHuman 1.5",
  priceVersions: [
    {
      id: "price-omni-123",
      customerCredits: 63n,
      effectiveTo: null,
    },
  ],
};

const fakeVoiceModel = {
  id: "voice-model-db-id",
  providerModelId: "seed-tts-2.0",
  displayName: "Seed Speech TTS 2.0",
  priceVersions: [
    {
      id: "price-voice-123",
      customerCredits: 16n,
      effectiveTo: null,
    },
  ],
};

function buildRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/spokesperson/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/spokesperson/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.trusted.mockReturnValue(true);
    mocks.session.mockResolvedValue(fakeSession);
    mocks.rateLimitCheck.mockResolvedValue(null);
    mocks.isBytePlusVisionConfigured.mockReturnValue(true);
    mocks.isBytePlusVoiceConfigured.mockReturnValue(true);
  });

  it("rejects untrusted mutation origin with 403", async () => {
    mocks.trusted.mockReturnValue(false);
    const res = await POST(buildRequest({}));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Origin not allowed.");
  });

  it("rejects unauthenticated requests with 401", async () => {
    mocks.session.mockResolvedValue(null);
    const res = await POST(buildRequest({}));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Authentication required.");
  });

  it("rejects invalid payload with 400", async () => {
    const res = await POST(
      buildRequest({
        organizationId: "org-1",
        avatarAssetId: "asset-avatar",
        // missing idempotencyKey, and missing script or drivingAudioAssetId
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid request payload.");
  });

  it("rejects when script exceeds 1000 characters", async () => {
    const res = await POST(
      buildRequest({
        organizationId: "org-1",
        avatarAssetId: "asset-avatar",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        audioMode: "SCRIPT",
        script: "a".repeat(1001),
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid request payload.");
  });

  it("returns 503 if BytePlus Vision is not configured", async () => {
    mocks.isBytePlusVisionConfigured.mockReturnValue(false);
    const res = await POST(
      buildRequest({
        organizationId: "org-1",
        avatarAssetId: "asset-avatar",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        audioMode: "SCRIPT",
        script: "Hello world!",
      }),
    );
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("OmniHuman generation is not configured.");
  });

  it("dispatches OmniHuman video job directly in AUDIO_ASSET mode", async () => {
    mocks.db.providerModel.findFirst.mockResolvedValueOnce(fakeOmniModel);
    mocks.createVideoJob.mockResolvedValueOnce({ id: "video-job-999" });

    const res = await POST(
      buildRequest({
        organizationId: "org-1",
        avatarAssetId: "avatar-asset-123",
        idempotencyKey: "22222222-2222-4222-8222-222222222222",
        audioMode: "AUDIO_ASSET",
        drivingAudioAssetId: "audio-asset-456",
        resolution: "1080p",
        motionPrompt: "Confident smile",
      }),
    );

    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json).toEqual({
      jobId: "video-job-999",
      status: "QUEUED",
      stage: "VIDEO",
    });

    expect(mocks.requireMembership).toHaveBeenCalledWith(
      mocks.db,
      "org-1",
      "user-123",
      true,
    );

    expect(mocks.createVideoJob).toHaveBeenCalledWith("user-123", {
      schemaVersion: 2,
      workflow: "TALKING_AVATAR",
      organizationId: "org-1",
      projectId: undefined,
      modelId: "omni-model-db-id",
      priceVersionId: "price-omni-123",
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
      prompt: "Confident smile",
      sources: [
        { assetId: "avatar-asset-123", role: "AVATAR_IMAGE", position: 0 },
        { assetId: "audio-asset-456", role: "DRIVING_AUDIO", position: 1 },
      ],
      aspectRatio: "adaptive",
      resolution: "1080p",
      durationSeconds: -1,
      generateAudio: false,
      outputFormat: "mp4",
      returnLastFrame: false,
    });
  });

  it("dispatches Seed-TTS voice job in SCRIPT mode", async () => {
    mocks.db.providerModel.findFirst
      .mockResolvedValueOnce(fakeOmniModel) // omnihuman lookup
      .mockResolvedValueOnce(fakeVoiceModel); // seed-tts lookup

    mocks.createVoiceJob.mockResolvedValueOnce({ id: "voice-job-888" });

    const res = await POST(
      buildRequest({
        organizationId: "org-1",
        avatarAssetId: "avatar-asset-123",
        idempotencyKey: "33333333-3333-4333-8333-333333333333",
        audioMode: "SCRIPT",
        script: "Welcome to Aiwa Creator!",
        voiceKey: "charlotte",
        speechRate: 1.1,
      }),
    );

    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json).toEqual({
      voiceJobId: "voice-job-888",
      status: "QUEUED",
      stage: "AUDIO",
      omniHumanModelId: "omni-model-db-id",
      omniHumanPriceVersionId: "price-omni-123",
    });

    expect(mocks.createVoiceJob).toHaveBeenCalledWith("user-123", {
      organizationId: "org-1",
      projectId: undefined,
      modelId: "voice-model-db-id",
      priceVersionId: "price-voice-123",
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
      text: "Welcome to Aiwa Creator!",
      voiceKey: "charlotte",
      speechRate: 1.1,
      format: "mp3",
    });
  });
});
