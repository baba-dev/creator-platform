import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  trusted: vi.fn(),
  session: vi.fn(),
  tx: {
    providerTool: { upsert: vi.fn() },
    auditEvent: { create: vi.fn() },
  },
  db: { $transaction: vi.fn() },
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/request-security", () => ({
  hasTrustedMutationOrigin: mocks.trusted,
}));
vi.mock("@/lib/request-auth", () => ({ getRequestSession: mocks.session }));
vi.mock("@aiwa/db", () => ({ db: mocks.db }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.trusted.mockReturnValue(true);
  mocks.session.mockResolvedValue({
    user: { id: "admin", platformRole: "PLATFORM_ADMIN" },
  });
  mocks.db.$transaction.mockImplementation((fn) => fn(mocks.tx));
});

describe("MediaKit tool registry sync", () => {
  it("creates audited disabled registry rows without storing runtime endpoints", async () => {
    const response = await POST(
      new Request("https://example.com/api/admin/tools/sync", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.tx.providerTool.upsert).toHaveBeenCalled();
    const create = mocks.tx.providerTool.upsert.mock.calls[0]![0].create;
    expect(create.enabled).toBe(false);
    expect(create.provider).toBe("BYTEPLUS");
    expect(create).not.toHaveProperty("endpoint");
    expect(mocks.tx.auditEvent.create).toHaveBeenCalled();
  });

  it("blocks untrusted origins", async () => {
    mocks.trusted.mockReturnValue(false);
    const response = await POST(
      new Request("https://example.com/api/admin/tools/sync", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(403);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });
});
