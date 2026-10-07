import type { Prisma } from "@aiwa/db";
import { describe, expect, it, vi } from "vitest";
import { assertWithinMonthlySpendingCap } from "../src/index";

describe("assertWithinMonthlySpendingCap", () => {
  it("skips all database aggregation and checks when cap is null", async () => {
    const generationAggregate = vi.fn();
    const toolAggregate = vi.fn();
    const mockTx = {
      generationJob: { aggregate: generationAggregate },
      providerToolExecution: { aggregate: toolAggregate },
    } as unknown as Prisma.TransactionClient;

    await expect(
      assertWithinMonthlySpendingCap(mockTx, {
        organizationId: "org-1",
        userId: "user-1",
        cap: null,
        additionalCredits: 100n,
      }),
    ).resolves.toBeUndefined();

    expect(generationAggregate).not.toHaveBeenCalled();
    expect(toolAggregate).not.toHaveBeenCalled();
  });

  it("allows generation when combined generation and provider-tool spend stays within cap", async () => {
    const generationAggregate = vi
      .fn()
      .mockResolvedValueOnce({ _sum: { chargedCredits: 250n } })
      .mockResolvedValueOnce({ _sum: { reservedCredits: 50n } });
    const toolAggregate = vi
      .fn()
      .mockResolvedValueOnce({ _sum: { chargedCredits: 40n } })
      .mockResolvedValueOnce({ _sum: { reservedCredits: 60n } });

    const mockTx = {
      generationJob: { aggregate: generationAggregate },
      providerToolExecution: { aggregate: toolAggregate },
    } as unknown as Prisma.TransactionClient;

    await expect(
      assertWithinMonthlySpendingCap(mockTx, {
        organizationId: "org-1",
        userId: "user-1",
        cap: 500n,
        additionalCredits: 100n,
      }),
    ).resolves.toBeUndefined();

    expect(generationAggregate).toHaveBeenCalledTimes(2);
    expect(toolAggregate).toHaveBeenCalledTimes(2);
  });

  it("throws GenerationError when provider-tool reservations push total spend over cap", async () => {
    const generationAggregate = vi
      .fn()
      .mockResolvedValueOnce({ _sum: { chargedCredits: 350n } })
      .mockResolvedValueOnce({ _sum: { reservedCredits: 25n } });
    const toolAggregate = vi
      .fn()
      .mockResolvedValueOnce({ _sum: { chargedCredits: 25n } })
      .mockResolvedValueOnce({ _sum: { reservedCredits: 50n } });

    const mockTx = {
      generationJob: { aggregate: generationAggregate },
      providerToolExecution: { aggregate: toolAggregate },
    } as unknown as Prisma.TransactionClient;

    await expect(
      assertWithinMonthlySpendingCap(mockTx, {
        organizationId: "org-1",
        userId: "user-1",
        cap: 500n,
        additionalCredits: 60n, // 450 + 60 = 510 > 500
      }),
    ).rejects.toThrow("Monthly spending cap exceeded.");

    expect(generationAggregate).toHaveBeenCalledTimes(2);
    expect(toolAggregate).toHaveBeenCalledTimes(2);
  });
});
