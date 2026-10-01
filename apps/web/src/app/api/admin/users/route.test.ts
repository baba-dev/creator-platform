import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasTrustedMutationOrigin: vi.fn(),
  getRequestSession: vi.fn(),
  createAdminManagedUser: vi.fn(),
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
    createAdminManagedUser: mocks.createAdminManagedUser,
  };
});
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { AdminUserCredentialError } from "@/lib/admin-user-credentials";
import { POST } from "./route";

describe("POST /api/admin/users", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.hasTrustedMutationOrigin.mockReturnValue(true);
  });

  it("rejects untrusted origins", async () => {
    mocks.hasTrustedMutationOrigin.mockReturnValue(false);
    const response = await POST(
      new Request("https://example.test/api/admin/users", { method: "POST" }),
    );
    expect(response.status).toBe(403);
    expect(mocks.getRequestSession).not.toHaveBeenCalled();
  });

  it("rejects users without users:manage", async () => {
    mocks.getRequestSession.mockResolvedValue({
      user: { id: "user-1", platformRole: "USER" },
    });
    const response = await POST(
      new Request("https://example.test/api/admin/users", { method: "POST" }),
    );
    expect(response.status).toBe(403);
    expect(mocks.createAdminManagedUser).not.toHaveBeenCalled();
  });

  it("enforces the password length policy", async () => {
    mocks.getRequestSession.mockResolvedValue({
      user: { id: "admin-1", platformRole: "PLATFORM_ADMIN" },
    });
    const response = await POST(
      new Request("https://example.test/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New User",
          email: "new@example.test",
          password: "short",
          role: "USER",
          emailVerified: false,
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.createAdminManagedUser).not.toHaveBeenCalled();
  });

  it("creates an ordinary account for a platform admin", async () => {
    mocks.getRequestSession.mockResolvedValue({
      user: { id: "admin-1", platformRole: "PLATFORM_ADMIN" },
    });
    mocks.createAdminManagedUser.mockResolvedValue({
      id: "cm123456789012345678901234",
      name: "New User",
      email: "new@example.test",
      platformRole: "USER",
      emailVerified: false,
    });
    const response = await POST(
      new Request("https://example.test/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New User",
          email: "NEW@example.test",
          password: "ExamplePassword123!",
          role: "USER",
          emailVerified: false,
        }),
      }),
    );
    expect(response.status).toBe(201);
    expect(mocks.createAdminManagedUser).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { userId: "admin-1", platformRole: "PLATFORM_ADMIN" },
        email: "new@example.test",
        role: "USER",
      }),
    );
  });

  it("maps privilege denials to 403", async () => {
    mocks.getRequestSession.mockResolvedValue({
      user: { id: "admin-1", platformRole: "PLATFORM_ADMIN" },
    });
    mocks.createAdminManagedUser.mockRejectedValue(
      new AdminUserCredentialError(
        "FORBIDDEN",
        "Only a Platform Owner may create privileged platform accounts.",
      ),
    );
    const response = await POST(
      new Request("https://example.test/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Support User",
          email: "support@example.test",
          password: "ExamplePassword123!",
          role: "SUPPORT",
          emailVerified: false,
        }),
      }),
    );
    expect(response.status).toBe(403);
  });
});
