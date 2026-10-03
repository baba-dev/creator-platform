import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  trusted: vi.fn(),
  session: vi.fn(),
  limiterCheck: vi.fn(),
  membership: vi.fn(),
  reasoningFind: vi.fn(),
  discover: vi.fn(),
  selectModel: vi.fn(),
  admit: vi.fn(),
}));

vi.mock("@/lib/request-security", () => ({
  hasTrustedMutationOrigin: mocks.trusted,
}));
vi.mock("@/lib/request-auth", () => ({
  getRequestSession: mocks.session,
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ check: mocks.limiterCheck }),
}));
vi.mock("@/lib/studio-model-discovery", () => ({
  getAvailableStudioModels: mocks.discover,
  selectStudioModelBySelection: mocks.selectModel,
  StudioModelUnavailableError: class StudioModelUnavailableError extends Error {},
}));
vi.mock("@/lib/reasoning-admission", () => ({
  admitReasoningJob: mocks.admit,
  ReasoningAdmissionError: class ReasoningAdmissionError extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly retryAfterSeconds = 0,
    ) {
      super(message);
    }
  },
}));
vi.mock("@aiwa/db", () => ({
  db: {
    membership: { findUnique: mocks.membership },
    reasoningJob: { findUnique: mocks.reasoningFind },
  },
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {},
  },
}));

import { POST } from "./route";

const selected = {
  id: "groq-model-record",
  provider: "GROQ",
  providerModelId: "openai/gpt-oss-120b",
  name: "GPT-OSS 120B",
  description: "Reasoning",
  mediaKind: "REASONING",
  contextWindow: 131072,
  maxTokens: null,
  flags: { reasoning: true, fast: false },
  tasks: ["prompt-enhancement"],
  pricing: {
    priceVersionId: "groq-price-1",
    dimension: "TOKEN",
    unitQuantity: 1000,
  },
};

function request(overrides: Record<string, unknown> = {}) {
  return new Request("https://example.com/api/reasoning/dispatch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      organizationId: "org-1",
      userPrompt: "a desert portrait",
      targetMedia: "IMAGE",
      idempotencyKey: "7f522881-37bb-43cb-901d-b6749f95a812",
      modelId: selected.id,
      ...overrides,
    }),
  });
}

describe("multi-provider prompt enhancement dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.trusted.mockReturnValue(true);
    mocks.session.mockResolvedValue({
      user: { id: "user-1", platformRole: "USER" },
    });
    mocks.limiterCheck.mockResolvedValue(null);
    mocks.membership.mockResolvedValue({
      role: "ORGANIZATION_MEMBER",
      organization: { status: "ACTIVE" },
    });
    mocks.reasoningFind.mockResolvedValue(null);
    mocks.discover.mockResolvedValue({
      task: "prompt-enhancement",
      defaultModelId: selected.id,
      models: [selected],
    });
    mocks.selectModel.mockReturnValue(selected);
    mocks.admit.mockResolvedValue({
      job: { id: "reason-job-1", status: "QUEUED" },
      isExisting: false,
    });
  });

  it("queues the selected discovered provider without any NVIDIA environment dependency", async () => {
    const response = await POST(request());
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      jobId: "reason-job-1",
      status: "QUEUED",
      model: {
        id: selected.id,
        provider: "GROQ",
        providerModelId: "openai/gpt-oss-120b",
        name: "GPT-OSS 120B",
      },
    });
    expect(mocks.admit).toHaveBeenCalledWith(
      expect.objectContaining({
        providerModelId: selected.id,
        priceVersionId: "groq-price-1",
      }),
    );
  });

  it("uses task discovery default when the client omits a model", async () => {
    const response = await POST(request({ modelId: undefined }));
    expect(response.status).toBe(202);
    expect(mocks.selectModel).toHaveBeenCalledWith(
      expect.objectContaining({ defaultModelId: selected.id }),
      selected.id,
    );
  });

  it("returns a prior idempotent job before current discovery changes", async () => {
    mocks.reasoningFind.mockResolvedValue({
      id: "reason-existing",
      organizationId: "org-1",
      providerModelId: selected.id,
      status: "SUCCEEDED",
      requestPayload: {
        task: "prompt-enhancement",
        userPrompt: "a desert portrait",
        targetMedia: "IMAGE",
      },
      providerModel: {
        id: selected.id,
        provider: "GROQ",
        providerModelId: "openai/gpt-oss-120b",
        displayName: "GPT-OSS 120B",
      },
    });

    const response = await POST(request());
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      jobId: "reason-existing",
      status: "SUCCEEDED",
      model: { provider: "GROQ" },
    });
    expect(mocks.discover).not.toHaveBeenCalled();
    expect(mocks.admit).not.toHaveBeenCalled();
  });

  it("rejects reuse of an idempotency key with another model", async () => {
    mocks.reasoningFind.mockResolvedValue({
      id: "reason-existing",
      organizationId: "org-1",
      providerModelId: selected.id,
      status: "QUEUED",
      requestPayload: {
        task: "prompt-enhancement",
        userPrompt: "a desert portrait",
        targetMedia: "IMAGE",
      },
      providerModel: {
        id: selected.id,
        provider: "GROQ",
        providerModelId: "openai/gpt-oss-120b",
        displayName: "GPT-OSS 120B",
      },
    });

    const response = await POST(request({ modelId: "another-model" }));
    expect(response.status).toBe(409);
  });

  it("returns 503 when no enabled, priced, configured task model exists", async () => {
    mocks.discover.mockResolvedValue({
      task: "prompt-enhancement",
      defaultModelId: null,
      models: [],
    });

    const response = await POST(request());
    expect(response.status).toBe(503);
  });
});
