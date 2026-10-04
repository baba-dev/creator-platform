import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  trusted: vi.fn(),
  session: vi.fn(),
  db: {
    chatThread: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/request-security", () => ({
  hasTrustedMutationOrigin: mocks.trusted,
}));

vi.mock("@/lib/request-auth", () => ({
  getRequestSession: mocks.session,
}));

vi.mock("@/lib/chat-model-selection", () => ({
  clientChatModelReference: vi.fn(),
}));

vi.mock("@/lib/studio-model-discovery", () => ({
  getAvailableStudioModels: vi.fn(),
}));

vi.mock("@aiwa/db", () => ({
  db: mocks.db,
}));

import { PATCH, DELETE } from "./route";

const fakeUser = { id: "user_1", name: "Test User", email: "test@example.com" };
const fakeOrg = { id: "org_1", status: "ACTIVE" };

describe("PATCH /api/chat/threads/[threadId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.trusted.mockReturnValue(true);
    mocks.session.mockResolvedValue({ user: fakeUser });
  });

  it("rejects untrusted mutation origins", async () => {
    mocks.trusted.mockReturnValue(false);

    const req = new Request("https://example.com/api/chat/threads/th_1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New Title" }),
    });

    const res = await PATCH(req, {
      params: Promise.resolve({ threadId: "th_1" }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Origin not allowed.");
  });

  it("requires authentication", async () => {
    mocks.session.mockResolvedValue(null);

    const req = new Request("https://example.com/api/chat/threads/th_1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New Title" }),
    });

    const res = await PATCH(req, {
      params: Promise.resolve({ threadId: "th_1" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 404 if thread not found or belongs to another user", async () => {
    mocks.db.chatThread.findUnique.mockResolvedValue(null);

    const req = new Request("https://example.com/api/chat/threads/th_1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New Title" }),
    });

    const res = await PATCH(req, {
      params: Promise.resolve({ threadId: "th_1" }),
    });

    expect(res.status).toBe(404);
  });

  it("validates empty title", async () => {
    mocks.db.chatThread.findUnique.mockResolvedValue({
      id: "th_1",
      organizationId: "org_1",
      createdById: "user_1",
    });
    mocks.db.membership.findUnique.mockResolvedValue({
      organizationId: "org_1",
      userId: "user_1",
      role: "ORGANIZATION_MEMBER",
      organization: fakeOrg,
    });

    const req = new Request("https://example.com/api/chat/threads/th_1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "   " }),
    });

    const res = await PATCH(req, {
      params: Promise.resolve({ threadId: "th_1" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Title cannot be empty");
  });

  it("updates thread title successfully when authorized", async () => {
    mocks.db.chatThread.findUnique.mockResolvedValue({
      id: "th_1",
      organizationId: "org_1",
      createdById: "user_1",
    });
    mocks.db.membership.findUnique.mockResolvedValue({
      organizationId: "org_1",
      userId: "user_1",
      role: "ORGANIZATION_MEMBER",
      organization: fakeOrg,
    });
    mocks.db.chatThread.update.mockResolvedValue({
      id: "th_1",
      title: "Updated Project Pitch",
      updatedAt: new Date("2026-10-03T12:00:00Z"),
    });

    const req = new Request("https://example.com/api/chat/threads/th_1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated Project Pitch" }),
    });

    const res = await PATCH(req, {
      params: Promise.resolve({ threadId: "th_1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.thread.title).toBe("Updated Project Pitch");
    expect(mocks.db.chatThread.update).toHaveBeenCalledWith({
      where: { id: "th_1" },
      data: { title: "Updated Project Pitch" },
      select: { id: true, title: true, updatedAt: true },
    });
  });
});

describe("DELETE /api/chat/threads/[threadId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.trusted.mockReturnValue(true);
    mocks.session.mockResolvedValue({ user: fakeUser });
  });

  it("deletes thread successfully when authorized", async () => {
    mocks.db.chatThread.findUnique.mockResolvedValue({
      id: "th_1",
      organizationId: "org_1",
      createdById: "user_1",
    });
    mocks.db.membership.findUnique.mockResolvedValue({
      organizationId: "org_1",
      userId: "user_1",
      role: "ORGANIZATION_MEMBER",
      organization: fakeOrg,
    });
    mocks.db.chatThread.delete.mockResolvedValue({ id: "th_1" });

    const req = new Request("https://example.com/api/chat/threads/th_1", {
      method: "DELETE",
    });

    const res = await DELETE(req, {
      params: Promise.resolve({ threadId: "th_1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mocks.db.chatThread.delete).toHaveBeenCalledWith({
      where: { id: "th_1" },
    });
  });
});
