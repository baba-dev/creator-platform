import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasTrustedMutationOrigin: vi.fn(),
  getRequestSession: vi.fn(),
  resetAdminManagedUserPassword: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/request-security", () => ({
  hasTrustedMutationOrigin: mocks.hasTrustedMutationOrigin,
}));
vi.mock("@/lib/request-auth", () => ({
  getRequestSession: mocks.getRequestSession,
}));
vi.mock("@/lib/admin-user-credentials", async () => {
  class AdminUserCredentialError extends Error {
    constructor(
      public readonly code: "FORBIDDEN" | "USER_NOT_FOUND" | "EMAIL_EXISTS",
      message: string,
    ) {
      super(message);
      this.name = "AdminUserCredentialError";
    }
  }
  return {
    AdminUserCredentialError,
    resetAdminManagedUserPassword: mocks.resetAdminManagedUserPassword,
  };
});
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { AdminUserCredentialError } from "@/lib/admin-user-credentials";
import { POST } from "./route";

const userId = "cm123456789012345678901234";

describe("POST /api/admin/users/[userId]/password", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.hasTrustedMutationOrigin.mockReturnValue(true);
    mocks.getRequestSession.mockResolvedValue({
      user: { id: "admin-1", platformRole: "PLATFORM_ADMIN" },
    });
  });

  it("rejects invalid user identifiers", async () => {
    const response = await POST(
      new Request("https://example.test/api/admin/users/no/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "ExamplePassword123!" }),
      }),
      { params: Promise.resolve({ userId: "no" }) },
    );
    expect(response.status).toBe(404);
    expect(mocks.resetAdminManagedUserPassword).not.toHaveBeenCalled();
  });

  it("rejects short passwords", async () => {
    const response = await POST(
      new Request("https://example.test/api/admin/users/x/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "short" }),
      }),
      { params: Promise.resolve({ userId }) },
    );
    expect(response.status).toBe(400);
  });

  it("returns the number of sessions revoked", async () => {
    mocks.resetAdminManagedUserPassword.mockResolvedValue({
      userId,
      revokedSessions: 3,
    });
    const response = await POST(
      new Request("https://example.test/api/admin/users/x/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "ExamplePassword123!" }),
      }),
      { params: Promise.resolve({ userId }) },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      revokedSessions: 3,
    });
  });

  it("maps privileged target denial to 403", async () => {
    mocks.resetAdminManagedUserPassword.mockRejectedValue(
      new AdminUserCredentialError(
        "FORBIDDEN",
        "Only a Platform Owner may reset the password of a privileged platform account.",
      ),
    );
    const response = await POST(
      new Request("https://example.test/api/admin/users/x/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "ExamplePassword123!" }),
      }),
      { params: Promise.resolve({ userId }) },
    );
    expect(response.status).toBe(403);
  });
});
