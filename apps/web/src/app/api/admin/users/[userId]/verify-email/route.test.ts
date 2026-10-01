import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasTrustedMutationOrigin: vi.fn(),
  getRequestSession: vi.fn(),
  setUserEmailVerified: vi.fn(),
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
  setUserEmailVerified: mocks.setUserEmailVerified,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { POST } from "./route";

const userId = "AbCdEf0123456789GhIjKlMnOpQrStUv";

describe("POST /api/admin/users/[userId]/verify-email", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.hasTrustedMutationOrigin.mockReturnValue(true);
    mocks.getRequestSession.mockResolvedValue({
      user: {
        id: "OwNeR0123456789AbCdEfGhIjKlMnOp",
        platformRole: "PLATFORM_OWNER",
        twoFactorEnabled: true,
      },
    });
    mocks.setUserEmailVerified.mockResolvedValue({
      id: userId,
      emailVerified: true,
    });
  });

  it("accepts mixed-case Better Auth IDs for administrative verification", async () => {
    const response = await POST(
      new Request("https://example.test/api/admin/users/user/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verified: true,
          reason: "Mailbox ownership checked by administrator",
        }),
      }),
      { params: Promise.resolve({ userId }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.setUserEmailVerified).toHaveBeenCalledWith({
      actor: {
        userId: "OwNeR0123456789AbCdEfGhIjKlMnOp",
        platformRole: "PLATFORM_OWNER",
      },
      targetUserId: userId,
      verified: true,
      reason: "Mailbox ownership checked by administrator",
    });
  });
});
