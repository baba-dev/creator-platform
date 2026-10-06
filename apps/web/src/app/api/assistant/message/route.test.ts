import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  trusted: vi.fn(),
  session: vi.fn(),
  db: {
    chatThread: { findUnique: vi.fn(), findFirst: vi.fn() },
    membership: { findUnique: vi.fn() },
    chatMessage: {
      findMany: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    generationJob: { count: vi.fn(), findFirst: vi.fn() },
  },
  settings: vi.fn(),
  buildMessages: vi.fn(),
  complete: vi.fn(),
  local: vi.fn(),
  requireAccess: vi.fn(),
  issueQuote: vi.fn(),
  assertQuoted: vi.fn(),
  createTextJob: vi.fn(),
  textResult: vi.fn(),
}));

vi.mock("@/lib/request-security", () => ({
  hasTrustedMutationOrigin: mocks.trusted,
}));
vi.mock("@/lib/request-auth", () => ({
  getRequestSession: mocks.session,
}));
vi.mock("@aiwa/db", () => ({ db: mocks.db }));
vi.mock("@aiwa/authz", () => ({
  hasOrganizationPermission: vi.fn(() => true),
}));
vi.mock("@aiwa/assistant", async () => {
  const { z } = await import("zod");
  return {
    getAssistantSettings: mocks.settings,
    buildAssistantMessages: mocks.buildMessages,
    completeAssistantResponse: mocks.complete,
    localPixelReply: mocks.local,
    requirePixelAccess: mocks.requireAccess,
    pixelWorkspaceSchema: { optional: () => z.object({}).optional() },
  };
});
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ check: vi.fn().mockResolvedValue(null) }),
}));
vi.mock("@/lib/text-feature-generation", () => ({
  issueTextFeatureQuote: mocks.issueQuote,
  assertQuotedTextModel: mocks.assertQuoted,
}));
vi.mock("@aiwa/generation", () => ({
  GenerationError: class GenerationError extends Error {
    status: number;
    constructor(message: string, status = 500) {
      super(message);
      this.status = status;
    }
  },
  createTextJob: mocks.createTextJob,
  textResultFromJob: mocks.textResult,
}));

import { DELETE, POST } from "./route";

const session = { user: { id: "user-1" } };
const thread = {
  id: "thread-1",
  threadType: "PIXEL",
  createdById: "user-1",
  organizationId: "org-1",
  organization: { id: "org-1", slug: "creative", status: "ACTIVE" },
};
const membership = {
  role: "ORGANIZATION_MEMBER",
  organization: { status: "ACTIVE" },
};
const model = {
  id: "model-record",
  provider: "GROQ",
  providerModelId: "openai/gpt-oss-20b",
  displayName: "GPT OSS",
  capabilities: {},
};

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/assistant/message", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify(body),
  });
}

function deleteRequest(threadId = "thread-1") {
  return new Request(
    `http://localhost/api/assistant/message?threadId=${encodeURIComponent(threadId)}`,
    {
      method: "DELETE",
      headers: { Origin: "http://localhost" },
    },
  );
}

describe("POST /api/assistant/message", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.trusted.mockReturnValue(true);
    mocks.session.mockResolvedValue(session);
    mocks.db.chatThread.findUnique.mockResolvedValue(thread);
    mocks.db.chatThread.findFirst.mockResolvedValue(thread);
    mocks.db.membership.findUnique.mockResolvedValue(membership);
    mocks.db.chatMessage.findMany.mockResolvedValue([]);
    mocks.db.chatMessage.count.mockResolvedValue(0);
    mocks.db.chatMessage.deleteMany.mockResolvedValue({ count: 0 });
    mocks.db.generationJob.count.mockResolvedValue(0);
    mocks.db.generationJob.findFirst.mockResolvedValue(null);
    mocks.requireAccess.mockResolvedValue(undefined);
    mocks.local.mockResolvedValue(null);
    mocks.settings.mockResolvedValue({
      id: "default",
      providerModelRecordId: model.id,
      providerModel: model,
      pricingMode: "FREE",
      systemPromptOverride: null,
      enabled: true,
      updatedAt: new Date(),
    });
  });

  it("serves local help without a model or quote", async () => {
    mocks.settings.mockResolvedValue({ enabled: true, providerModel: null });
    mocks.local.mockResolvedValue({ content: "Storage help", toolResults: [] });
    mocks.complete.mockResolvedValue({
      content: "Storage help",
      chargedCredits: 0,
    });
    const response = await POST(
      request({
        threadId: thread.id,
        content: "How do I connect OneDrive?",
        mode: "local",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
      }),
    );
    expect(response.status).toBe(201);
    expect(mocks.createTextJob).not.toHaveBeenCalled();
    expect(mocks.issueQuote).not.toHaveBeenCalled();
  });

  it("rejects untrusted origins", async () => {
    mocks.trusted.mockReturnValue(false);
    expect((await POST(request({}))).status).toBe(403);
  });

  it("quotes sponsored requests at zero customer credits", async () => {
    mocks.buildMessages.mockResolvedValue([
      { role: "system", content: "Pixel" },
      { role: "user", content: "Hello" },
    ]);
    mocks.issueQuote.mockResolvedValue({
      quoteToken: "signed",
      quotedModelId: "model-record",
      priceVersionId: "price-1",
      estimatedCredits: "9",
      maximumChargeCredits: "12",
    });
    const response = await POST(
      request({
        threadId: "thread-1",
        content: "Hello",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        mode: "quote",
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        quote: expect.objectContaining({
          quoteToken: "signed",
          estimatedCredits: "0",
          maximumChargeCredits: "0",
          isFree: true,
        }),
      }),
    );
  });

  it("replays a completed response without invoking the provider", async () => {
    mocks.db.chatMessage.findMany.mockResolvedValue([
      { id: "u", role: "user", content: "Hello", metadata: null },
      {
        id: "a",
        role: "assistant",
        content: "Already done",
        metadata: { chargedCredits: 0, toolResults: [] },
      },
    ]);
    const response = await POST(
      request({
        threadId: "thread-1",
        content: "Hello",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
      }),
    );
    expect(response.status).toBe(201);
    expect((await response.json()).content).toBe("Already done");
    expect(mocks.createTextJob).not.toHaveBeenCalled();
    expect(mocks.issueQuote).not.toHaveBeenCalled();
  });

  it("quotes the exact canonical model in charged mode", async () => {
    mocks.settings.mockResolvedValue({
      id: "default",
      providerModelRecordId: model.id,
      providerModel: model,
      pricingMode: "CHARGED",
      systemPromptOverride: null,
      enabled: true,
      updatedAt: new Date(),
    });
    mocks.buildMessages.mockResolvedValue([
      { role: "system", content: "Pixel" },
      { role: "user", content: "Hello" },
    ]);
    mocks.issueQuote.mockResolvedValue({ quoteToken: "token" });
    const response = await POST(
      request({
        threadId: "thread-1",
        content: "Hello",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        mode: "quote",
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.issueQuote).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: "model-record" }),
    );
  });

  it("queues sponsored mode through the durable text worker without charging", async () => {
    mocks.buildMessages.mockResolvedValue([{ role: "user", content: "Hello" }]);
    mocks.assertQuoted.mockResolvedValue(undefined);
    mocks.createTextJob.mockResolvedValue({ id: "job-free", status: "QUEUED" });
    mocks.textResult.mockReturnValue(null);

    const response = await POST(
      request({
        threadId: "thread-1",
        content: "Hello",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        mode: "generate",
        quoteToken: "signed",
        quotedModelId: "model-record",
        priceVersionId: "price-1",
      }),
    );

    expect(response.status).toBe(202);
    expect(mocks.createTextJob).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ modelId: "model-record" }),
      { sponsored: true },
    );
  });

  it("returns 202 while a charged durable job is pending", async () => {
    mocks.settings.mockResolvedValue({
      id: "default",
      providerModelRecordId: model.id,
      providerModel: model,
      pricingMode: "CHARGED",
      systemPromptOverride: null,
      enabled: true,
      updatedAt: new Date(),
    });
    mocks.buildMessages.mockResolvedValue([{ role: "user", content: "Hello" }]);
    mocks.assertQuoted.mockResolvedValue(undefined);
    mocks.createTextJob.mockResolvedValue({ id: "job-1", status: "QUEUED" });
    mocks.textResult.mockReturnValue(null);

    const response = await POST(
      request({
        threadId: "thread-1",
        content: "Hello",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        mode: "generate",
        quoteToken: "quote",
        quotedModelId: "model-record",
        priceVersionId: "price-1",
      }),
    );
    expect(response.status).toBe(202);
  });
});

describe("DELETE /api/assistant/message", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.trusted.mockReturnValue(true);
    mocks.session.mockResolvedValue(session);
    mocks.db.chatThread.findFirst.mockResolvedValue(thread);
    mocks.db.chatMessage.findMany.mockResolvedValue([]);
    mocks.db.chatMessage.deleteMany.mockResolvedValue({ count: 4 });
    mocks.db.generationJob.findFirst.mockResolvedValue(null);
    mocks.requireAccess.mockResolvedValue(undefined);
  });

  it("clears only saved Pixel conversation messages", async () => {
    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      cleared: true,
      deletedCount: 4,
    });
    expect(mocks.requireAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        organizationId: "org-1",
        threadId: "thread-1",
      }),
    );
    expect(mocks.db.chatMessage.deleteMany).toHaveBeenCalledWith({
      where: {
        threadId: "thread-1",
        role: { in: ["user", "assistant"] },
        createdAt: { lte: expect.any(Date) },
      },
    });
  });

  it("refuses to clear while a durable Pixel request is still running", async () => {
    mocks.db.chatMessage.findMany.mockResolvedValue([
      {
        id: "pending-user",
        role: "user",
        content: "Make a plan",
        clientRequestId: "11111111-1111-4111-8111-111111111111",
      },
    ]);
    mocks.db.generationJob.findFirst.mockResolvedValue({ status: "RUNNING" });

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(409);
    expect(mocks.db.chatMessage.deleteMany).not.toHaveBeenCalled();
  });

  it("refuses to clear a just-started request before its job exists", async () => {
    mocks.db.chatMessage.findMany.mockResolvedValue([
      {
        id: "starting-user",
        role: "user",
        content: "Make a plan",
        clientRequestId: "11111111-1111-4111-8111-111111111111",
        createdAt: new Date(),
      },
    ]);

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(409);
    expect(mocks.db.chatMessage.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects untrusted clear requests", async () => {
    mocks.trusted.mockReturnValue(false);

    expect((await DELETE(deleteRequest())).status).toBe(403);
    expect(mocks.db.chatMessage.deleteMany).not.toHaveBeenCalled();
  });
});
