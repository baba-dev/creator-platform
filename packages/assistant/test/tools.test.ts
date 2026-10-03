import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    wallet: { findUnique: vi.fn() },
    generationJob: { findMany: vi.fn() },
    asset: { findMany: vi.fn() },
    assistantReminder: {
      findUnique: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
    },
    supportRequest: {
      findUnique: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
    },
    auditEvent: { create: vi.fn() },
  },
  enqueueMail: vi.fn(),
}));

vi.mock("@aiwa/db", () => ({ db: mocks.db }));
vi.mock("@aiwa/mail", () => ({ enqueueMail: mocks.enqueueMail }));

import { getBalanceTool } from "../src/tools/get-balance";
import { explainErrorTool } from "../src/tools/explain-error";
import { navigateTool } from "../src/tools/navigate";
import { setReminderTool } from "../src/tools/set-reminder";
import { escalateTool } from "../src/tools/escalate";
import { searchKnowledgebase } from "../src/kb/search";

const ctx = {
  userId: "user-1",
  organizationId: "org-1",
  organizationSlug: "creative-team",
  threadId: "thread-1",
  idempotencyKey: "11111111-1111-4111-8111-111111111111",
};

describe("assistant tools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the wallet balance", async () => {
    mocks.db.wallet.findUnique.mockResolvedValue({ balanceCache: 8500n });
    const result = (await getBalanceTool.execute({}, ctx)) as {
      balanceCredits: string;
    };
    expect(result.balanceCredits).toBe("8500");
  });

  it("only returns allowlisted navigation routes", async () => {
    const result = (await navigateTool.execute(
      { destination: "ASSETS" },
      ctx,
    )) as { route: string };
    expect(result.route).toBe("/app/creative-team/assets");
  });

  it("replays reminders idempotently", async () => {
    const future = new Date(Date.now() + 60_000);
    mocks.db.assistantReminder.findUnique.mockResolvedValue({
      id: "rem-1",
      message: "Review render",
      remindAt: future,
    });
    const result = (await setReminderTool.execute(
      { message: "Review render", remindAt: future.toISOString() },
      ctx,
    )) as { reminderId: string; replayed?: boolean };
    expect(result.reminderId).toBe("rem-1");
    expect(result.replayed).toBe(true);
    expect(mocks.db.assistantReminder.upsert).not.toHaveBeenCalled();
  });

  it("escapes and idempotently queues support escalation", async () => {
    mocks.db.supportRequest.findUnique.mockResolvedValue(null);
    mocks.db.supportRequest.count.mockResolvedValue(0);
    mocks.db.supportRequest.upsert.mockResolvedValue({
      id: "support-1",
      ticketRef: "TICK-20261003-ABCDEF",
      subject: "<b>Broken</b>",
      status: "OPEN",
    });
    mocks.enqueueMail.mockResolvedValue({ id: "mail-1" });
    mocks.db.auditEvent.create.mockResolvedValue({});
    const result = (await escalateTool.execute(
      { subject: "<b>Broken</b>", body: "<script>alert(1)</script>" },
      ctx,
    )) as { ticketRef: string };
    expect(result.ticketRef).toMatch(/^TICK-/);
    expect(mocks.enqueueMail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.not.stringContaining("<script>alert(1)</script>"),
        idempotencyKey: `support-${ctx.idempotencyKey}`,
      }),
    );
  });

  it("explains known errors and searches the knowledge base", async () => {
    const explained = (await explainErrorTool.execute(
      { errorMessage: "Insufficient credits in workspace wallet" },
      ctx,
    )) as { found: boolean };
    expect(explained.found).toBe(true);
    expect(searchKnowledgebase("generate an image", 3).length).toBeGreaterThan(
      0,
    );
  });
});
