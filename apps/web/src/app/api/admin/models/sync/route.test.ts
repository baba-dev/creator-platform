import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasTrustedMutationOrigin: vi.fn(),
  getRequestSession: vi.fn(),
  db: {
    providerModel: {
      upsert: vi.fn(),
    },
    auditEvent: {
      create: vi.fn(),
    },
  },
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/request-security", () => ({
  hasTrustedMutationOrigin: mocks.hasTrustedMutationOrigin,
}));

vi.mock("@/lib/request-auth", () => ({
  getRequestSession: mocks.getRequestSession,
}));

vi.mock("@aiwa/db", () => ({
  db: mocks.db,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { POST } from "./route";

describe("POST /api/admin/models/sync", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects untrusted mutation origins with 403", async () => {
    mocks.hasTrustedMutationOrigin.mockReturnValue(false);

    const request = new Request("https://example.com/api/admin/models/sync", {
      method: "POST",
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("Origin not allowed.");
  });

  it("rejects unauthenticated requests with 401", async () => {
    mocks.hasTrustedMutationOrigin.mockReturnValue(true);
    mocks.getRequestSession.mockResolvedValue(null);

    const request = new Request("https://example.com/api/admin/models/sync", {
      method: "POST",
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("Authentication required.");
  });

  it("rejects authenticated users lacking models:manage permission with 403", async () => {
    mocks.hasTrustedMutationOrigin.mockReturnValue(true);
    mocks.getRequestSession.mockResolvedValue({
      user: {
        id: "user-1",
        platformRole: "USER",
      },
    });

    const request = new Request("https://example.com/api/admin/models/sync", {
      method: "POST",
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("You do not have permission to manage models.");
  });

  it("allows platform admins with models:manage, syncs models, and logs audit event", async () => {
    mocks.hasTrustedMutationOrigin.mockReturnValue(true);
    mocks.getRequestSession.mockResolvedValue({
      user: {
        id: "admin-1",
        platformRole: "PLATFORM_ADMIN",
      },
    });
    mocks.db.providerModel.upsert.mockResolvedValue({});
    mocks.db.auditEvent.create.mockResolvedValue({});

    const request = new Request("https://example.com/api/admin/models/sync", {
      method: "POST",
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      success?: boolean;
      count?: number;
    };
    expect(body.success).toBe(true);
    expect(body.count).toBeGreaterThan(0);
    expect(mocks.db.providerModel.upsert).toHaveBeenCalled();
    expect(mocks.db.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: "admin-1",
          action: "models.synced",
          targetType: "Platform",
        }),
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/models");
  });
});
