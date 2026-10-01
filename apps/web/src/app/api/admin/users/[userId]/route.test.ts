import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasTrustedMutationOrigin: vi.fn(),
  getRequestSession: vi.fn(),
  setUserPlatformRole: vi.fn(),
  setUserDisabled: vi.fn(),
  revokeUserSessions: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/request-security", () => ({
  hasTrustedMutationOrigin: mocks.hasTrustedMutationOrigin,
}));
vi.mock("@/lib/request-auth", () => ({
  getRequestSession: mocks.getRequestSession,
}));
vi.mock("@/lib/organization-api", () => ({
  organizationError: vi.fn(),
}));
vi.mock("@aiwa/organizations", () => ({
  setUserPlatformRole: mocks.setUserPlatformRole,
  setUserDisabled: mocks.setUserDisabled,
  revokeUserSessions: mocks.revokeUserSessions,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { PATCH } from "./route";

const userId = "AbCdEf0123456789GhIjKlMnOpQrStUv";

describe("PATCH /api/admin/users/[userId]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.hasTrustedMutationOrigin.mockReturnValue(true);
    mocks.getRequestSession.mockResolvedValue({
      user: {
        id: "OwNeR0123456789AbCdEfGhIjKlMnOp",
        platformRole: "PLATFORM_OWNER",
      },
    });
    mocks.setUserPlatformRole.mockResolvedValue({});
  });

  it("accepts mixed-case Better Auth IDs for role reassignment", async () => {
    const response = await PATCH(
      new Request("https://example.test/api/admin/users/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "PLATFORM_ADMIN" }),
      }),
      { params: Promise.resolve({ userId }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.setUserPlatformRole).toHaveBeenCalledWith({
      actor: {
        userId: "OwNeR0123456789AbCdEfGhIjKlMnOp",
        platformRole: "PLATFORM_OWNER",
      },
      targetUserId: userId,
      role: "PLATFORM_ADMIN",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/admin/users/${userId}`);
  });

  it("still rejects path-unsafe user IDs before mutation", async () => {
    const response = await PATCH(
      new Request("https://example.test/api/admin/users/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "PLATFORM_ADMIN" }),
      }),
      { params: Promise.resolve({ userId: "invalid id" }) },
    );

    expect(response.status).toBe(404);
    expect(mocks.setUserPlatformRole).not.toHaveBeenCalled();
  });
});
