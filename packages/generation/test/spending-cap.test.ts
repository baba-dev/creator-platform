import type { Prisma } from "@aiwa/db";
import { describe, expect, it, vi } from "vitest";
import { assertWithinMonthlySpendingCap } from "../src/index";

describe("assertWithinMonthlySpendingCap", () => {
  it("skips all database aggregation and checks when cap is null", async () => {
    const aggregateMock = vi.fn();
    const mockTx = {
      generationJob: {
        aggregate: aggregateMock,
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      assertWithinMonthlySpendingCap(mockTx, {
        organizationId: "org-1",
        userId: "user-1",
        cap: null,
        additionalCredits: 100n,
      }),
    ).resolves.toBeUndefined();

    expect(aggregateMock).not.toHaveBeenCalled();
  });

  it("allows generation when spent plus additional credits is within cap", async () => {
    const aggregateMock = vi
      .fn()
      .mockResolvedValueOnce({ _sum: { chargedCredits: 300n } }) // SUCCEEDED
      .mockResolvedValueOnce({ _sum: { reservedCredits: 100n } }); // IN-FLIGHT

    const mockTx = {
      generationJob: {
        aggregate: aggregateMock,
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      assertWithinMonthlySpendingCap(mockTx, {
        organizationId: "org-1",
        userId: "user-1",
        cap: 500n,
        additionalCredits: 100n,
      }),
    ).resolves.toBeUndefined();

    expect(aggregateMock).toHaveBeenCalledTimes(2);
  });

  it("throws GenerationError when spent plus additional credits exceeds cap", async () => {
    const aggregateMock = vi
      .fn()
      .mockResolvedValueOnce({ _sum: { chargedCredits: 400n } })
      .mockResolvedValueOnce({ _sum: { reservedCredits: 50n } });

    const mockTx = {
      generationJob: {
        aggregate: aggregateMock,
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      assertWithinMonthlySpendingCap(mockTx, {
        organizationId: "org-1",
        userId: "user-1",
        cap: 500n,
        additionalCredits: 60n, // 450 + 60 = 510 > 500
      }),
    ).rejects.toThrow("Monthly spending cap exceeded.");

    expect(aggregateMock).toHaveBeenCalledTimes(2);
  });
});
