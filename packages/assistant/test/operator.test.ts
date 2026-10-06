import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    membership: { findUnique: vi.fn(), findMany: vi.fn() },
    chatThread: { findFirst: vi.fn() },
    asset: { findMany: vi.fn(), findFirst: vi.fn() },
    generationJob: { findMany: vi.fn(), findFirst: vi.fn() },
    providerModel: { findFirst: vi.fn() },
    pixelWorkflow: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    pixelAction: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    pixelPreference: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    brandProfile: { findFirst: vi.fn() },
    auditEvent: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    ledgerEntry: { findMany: vi.fn() },
    wallet: { findUnique: vi.fn() },
  },
  image: vi.fn(),
  video: vi.fn(),
  voice: vi.fn(),
  estimate: vi.fn(),
  sign: vi.fn(),
}));
vi.mock("@aiwa/db", () => ({ db: mocks.db, Prisma: { DbNull: null } }));
vi.mock("@aiwa/mail", () => ({ enqueueMail: vi.fn() }));
vi.mock("@aiwa/generation", () => ({
  GenerationError: class extends Error {
    constructor(
      message: string,
      public status = 500,
    ) {
      super(message);
    }
  },
  createImageJob: mocks.image,
  createVideoJob: mocks.video,
  createVoiceJob: mocks.voice,
  estimateAuthorizedGeneration: mocks.estimate,
  issueGenerationQuote: mocks.sign,
  quoteParameters: vi.fn(() => ({})),
  imageRequestSchema: { parse: vi.fn((input) => input) },
  videoRequestSchema: { parse: vi.fn((input) => input) },
  voiceRequestSchema: { parse: vi.fn((input) => input) },
}));

import { requirePixelAccess } from "../src/access";
import { executeAssistantTool } from "../src/tools/registry";
import { localPixelReply } from "../src/local";
import { getPixelPreferences, savePixelPreferences } from "../src/preferences";
import {
  pixelWorkflowSchema,
  executePixelAction,
  quotePixelAction,
  cancelPixelWorkflow,
} from "../src/workflows";

const ctx = {
  organizationId: "org-1",
  userId: "user-1",
  threadId: "thread-1",
  organizationSlug: "forged-slug",
  idempotencyKey: "request-1",
};
const step = {
  kind: "IMAGE",
  modelId: "model-1",
  prompt: "A product photograph",
};
const quote = {
  quoteId: "q-1",
  quoteToken: "signed",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  maximumChargeCredits: "99",
  request: { immutable: true },
};
const action = {
  id: "action-1",
  workflowId: "workflow-1",
  position: 1,
  payload: step,
  status: "PREPARED",
  jobId: null,
  quote,
  workflow: { id: "workflow-1", cancelledAt: null, actions: [] },
};

describe("Pixel operator security and durable actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.membership.findUnique.mockResolvedValue({
      role: "ORGANIZATION_OWNER",
      organization: { status: "ACTIVE", slug: "verified-workspace" },
    });
    mocks.db.chatThread.findFirst.mockResolvedValue({ id: ctx.threadId });
    mocks.db.auditEvent.create.mockResolvedValue({});
    mocks.db.$transaction.mockImplementation((fn) => fn(mocks.db));
    mocks.db.pixelAction.findFirst.mockResolvedValue(action);
    mocks.db.pixelAction.findUnique.mockResolvedValue(action);
    mocks.db.pixelAction.updateMany.mockResolvedValue({ count: 1 });
    mocks.db.pixelWorkflow.findUnique.mockResolvedValue(action.workflow);
    mocks.db.pixelWorkflow.findFirst.mockResolvedValue(action.workflow);
    mocks.image.mockResolvedValue({ id: "job-1", status: "QUEUED" });
    mocks.db.pixelPreference.findUnique.mockResolvedValue(null);
  });

  it("rejects revoked membership and inaccessible threads before executing tools", async () => {
    mocks.db.membership.findUnique.mockResolvedValue(null);
    await expect(
      executeAssistantTool("app.getAssets", {}, ctx),
    ).rejects.toThrow("access denied");
    expect(mocks.db.asset.findMany).not.toHaveBeenCalled();
    mocks.db.membership.findUnique.mockResolvedValue({
      role: "ORGANIZATION_OWNER",
      organization: { status: "ACTIVE" },
    });
    mocks.db.chatThread.findFirst.mockResolvedValue(null);
    await expect(requirePixelAccess(ctx)).rejects.toThrow("access denied");
  });

  it("blocks viewer member access and derives navigation from the server membership", async () => {
    mocks.db.membership.findUnique.mockResolvedValue({
      role: "ORGANIZATION_VIEWER",
      organization: { status: "ACTIVE", slug: "verified-workspace" },
    });
    await expect(
      executeAssistantTool("app.getMembers", {}, ctx),
    ).rejects.toThrow("access denied");
    const result = await executeAssistantTool(
      "app.navigate",
      { destination: "IMAGE_STUDIO" },
      ctx,
    );
    expect(result.output).toMatchObject({
      route: "/app/verified-workspace/image",
    });
  });

  it("restricts asset search to accessible purposes and never selects credentials or storage paths", async () => {
    mocks.db.asset.findMany.mockResolvedValue([]);
    await executeAssistantTool("app.getAssets", { query: "logo" }, ctx);
    expect(mocks.db.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ctx.organizationId,
          OR: [
            { purpose: "GENERAL" },
            { purpose: "REFERENCE_INPUT", storageOwnerUserId: ctx.userId },
          ],
        }),
        take: 5,
      }),
    );
    const selection = mocks.db.asset.findMany.mock.calls[0]![0].select;
    expect(selection).not.toHaveProperty("objectKey");
    expect(selection).not.toHaveProperty("externalFileId");
  });

  it("does not turn help questions into support messages or reminders", async () => {
    await expect(
      executeAssistantTool(
        "app.escalate",
        {},
        { ...ctx, userMessage: "How can I open a support ticket?" },
      ),
    ).rejects.toThrow("explicitly");
    await expect(
      executeAssistantTool(
        "app.setReminder",
        {},
        { ...ctx, userMessage: "Explain reminders" },
      ),
    ).rejects.toThrow("explicitly");
  });

  it("serves deterministic live balance and provider-independent documentation", async () => {
    mocks.db.wallet.findUnique.mockResolvedValue({
      balanceCache: 912345678901234567n,
    });
    expect(
      (await localPixelReply("What is my current credit balance?", ctx))
        ?.content,
    ).toContain("912,345,678,901,234,567");
    expect(
      (await localPixelReply("How do I connect OneDrive?", ctx))?.content,
    ).toContain("Storage");
    expect(await localPixelReply("Generate a new campaign", ctx)).toBeNull();
  });

  it("rejects future source steps and oversized workflows", () => {
    expect(
      pixelWorkflowSchema.safeParse({
        title: "Invalid",
        steps: [{ ...step, sourceStep: 1 }],
      }).success,
    ).toBe(false);
    expect(
      pixelWorkflowSchema.safeParse({
        title: "Invalid",
        steps: Array(6).fill(step),
      }).success,
    ).toBe(false);
  });

  it("does not admit changed, expired or cancelled approvals", async () => {
    await expect(
      executePixelAction(ctx, action.id, "different-quote"),
    ).rejects.toThrow("changed");
    expect(mocks.image).not.toHaveBeenCalled();
    mocks.db.pixelAction.findUnique.mockResolvedValue({
      ...action,
      quote: { ...quote, expiresAt: "2000-01-01T00:00:00Z" },
    });
    await expect(
      executePixelAction(ctx, action.id, quote.quoteId),
    ).rejects.toThrow("expired");
    mocks.db.pixelWorkflow.findUnique.mockResolvedValue({
      ...action.workflow,
      cancelledAt: new Date(),
    });
    await expect(
      executePixelAction(ctx, action.id, quote.quoteId),
    ).rejects.toThrow("cancelled");
    expect(mocks.image).not.toHaveBeenCalled();
  });

  it("submits the saved immutable request and recovers with the same canonical input", async () => {
    await executePixelAction(ctx, action.id, quote.quoteId);
    expect(mocks.image).toHaveBeenCalledWith(ctx.userId, quote.request);
    expect(mocks.db.pixelAction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "ADMITTING" }),
      }),
    );
    mocks.db.pixelAction.findUnique.mockResolvedValue({
      ...action,
      status: "ADMITTING",
    });
    await executePixelAction(ctx, action.id, quote.quoteId);
    expect(mocks.image.mock.calls[1]).toEqual(mocks.image.mock.calls[0]);
  });

  it("replays linked jobs without generation and prevents requoting uncertain admission", async () => {
    mocks.db.pixelAction.findFirst.mockResolvedValue({
      ...action,
      jobId: "existing-job",
    });
    await expect(
      executePixelAction(ctx, action.id, "old-quote"),
    ).resolves.toEqual({ jobId: "existing-job", replayed: true });
    expect(mocks.image).not.toHaveBeenCalled();
    mocks.db.pixelAction.findFirst.mockResolvedValue({
      ...action,
      status: "ADMITTING",
    });
    await expect(quotePixelAction(ctx, action.id)).rejects.toThrow(
      "cannot be requoted",
    );
  });

  it("resets only a definitively rejected admission without a durable job", async () => {
    mocks.image.mockRejectedValue(new RangeError("Quote expired"));
    mocks.db.generationJob.findFirst.mockResolvedValue(null);
    await expect(
      executePixelAction(ctx, action.id, quote.quoteId),
    ).rejects.toThrow("expired");
    expect(mocks.db.pixelAction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "DRAFT", quote: null, approvedAt: null },
      }),
    );
    mocks.db.pixelAction.updateMany.mockClear();
    mocks.image.mockRejectedValue(new Error("Connection was interrupted"));
    await expect(
      executePixelAction(ctx, action.id, quote.quoteId),
    ).rejects.toThrow("interrupted");
    expect(mocks.db.pixelAction.updateMany).not.toHaveBeenCalled();
  });

  it("stops future steps without cancelling accepted jobs", async () => {
    expect(await cancelPixelWorkflow(ctx, "workflow-1")).toMatchObject({
      cancelled: true,
    });
    expect(mocks.db.pixelWorkflow.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { cancelledAt: expect.any(Date) } }),
    );
    expect(mocks.image).not.toHaveBeenCalled();
  });

  it("preferences default off, reject foreign brands, and delete saved choices when forgotten", async () => {
    expect(await getPixelPreferences(ctx)).toMatchObject({ enabled: false });
    mocks.db.brandProfile.findFirst.mockResolvedValue(null);
    await expect(
      savePixelPreferences(ctx, { enabled: true, brandProfileId: "foreign" }),
    ).rejects.toThrow("not found");
    await savePixelPreferences(ctx, { enabled: false });
    expect(mocks.db.pixelPreference.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ctx.organizationId, userId: ctx.userId },
    });
  });
});
