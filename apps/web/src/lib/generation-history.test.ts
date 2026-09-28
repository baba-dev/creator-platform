import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  membership: vi.fn(),
  findMany: vi.fn(),
}));
vi.mock("@aiwa/db", () => ({
  db: {
    membership: { findUnique: mocks.membership },
    generationJob: { findMany: mocks.findMany },
  },
}));
import {
  historyQuerySchema,
  listGenerationHistory,
} from "./generation-history";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.membership.mockResolvedValue({
    role: "ORGANIZATION_MEMBER",
    organization: { status: "ACTIVE" },
    user: { disabledAt: null, emailVerified: true },
  });
  mocks.findMany.mockResolvedValue([]);
});

describe("generation history access and pagination", () => {
  it("limits members to their own jobs and bounds page size", async () => {
    const input = historyQuerySchema.parse({
      organizationId: "org1",
      limit: "20",
      status: "SUCCEEDED",
    });
    await listGenerationHistory(input, "user1");
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org1",
          createdById: "user1",
          status: "SUCCEEDED",
        }),
        take: 21,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    );
    expect(
      historyQuerySchema.safeParse({ organizationId: "org1", limit: 1000 })
        .success,
    ).toBe(false);
  });

  it("lets owners filter by creator and rejects malformed cursors", async () => {
    mocks.membership.mockResolvedValue({
      role: "ORGANIZATION_OWNER",
      organization: { status: "ACTIVE" },
      user: { disabledAt: null, emailVerified: true },
    });
    await listGenerationHistory(
      historyQuerySchema.parse({ organizationId: "org1", creatorId: "user2" }),
      "owner",
    );
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ createdById: "user2" }),
      }),
    );
    await expect(
      listGenerationHistory(
        historyQuerySchema.parse({ organizationId: "org1", cursor: "invalid" }),
        "owner",
      ),
    ).rejects.toThrow("Invalid history cursor.");
  });

  it("does not query jobs when membership is inactive", async () => {
    mocks.membership.mockResolvedValue({
      role: "ORGANIZATION_MEMBER",
      organization: { status: "SUSPENDED" },
      user: { disabledAt: null, emailVerified: true },
    });
    await expect(
      listGenerationHistory(
        historyQuerySchema.parse({ organizationId: "org1" }),
        "user1",
      ),
    ).resolves.toBeNull();
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
