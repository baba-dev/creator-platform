import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasTrustedMutationOrigin: vi.fn(),
  getRequestSession: vi.fn(),
  addMember: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/request-security", () => ({
  hasTrustedMutationOrigin: mocks.hasTrustedMutationOrigin,
}));
vi.mock("@/lib/request-auth", () => ({
  getRequestSession: mocks.getRequestSession,
}));
vi.mock("@aiwa/organizations", () => ({
  addMember: mocks.addMember,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { POST } from "./route";

const userId = "AbCdEf0123456789GhIjKlMnOpQrStUv";
const organizationId = "cm123456789012345678901234";

describe("POST /api/admin/users/[userId]/memberships", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.hasTrustedMutationOrigin.mockReturnValue(true);
    mocks.getRequestSession.mockResolvedValue({
      user: {
        id: "AdMiN0123456789AbCdEfGhIjKlMnOp",
        platformRole: "PLATFORM_ADMIN",
      },
    });
    mocks.addMember.mockResolvedValue({
      id: "cm987654321098765432109876",
    });
  });

  it("accepts mixed-case Better Auth IDs when attaching organizations", async () => {
    const response = await POST(
      new Request("https://example.test/api/admin/users/user/memberships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          role: "ORGANIZATION_MEMBER",
          monthlySpendingCapCredits: null,
        }),
      }),
      { params: Promise.resolve({ userId }) },
    );

    expect(response.status).toBe(201);
    expect(mocks.addMember).toHaveBeenCalledWith({
      actor: {
        userId: "AdMiN0123456789AbCdEfGhIjKlMnOp",
        platformRole: "PLATFORM_ADMIN",
        organizationId,
      },
      organizationId,
      userId,
      role: "ORGANIZATION_MEMBER",
      monthlySpendingCapCredits: null,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/admin/users/${userId}`);
  });
});
