import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@aiwa/db";

import {
  IdempotencyConflictError,
  InsufficientCreditsError,
  InvalidAmountError,
  ReservationAlreadySettledError,
  ReservationNotFoundError,
  WalletNotFoundError,
  captureCreditsForJob,
  getWalletBalance,
  grantCredits,
  releaseOrRefundCredits,
  reserveCreditsForJob,
} from "../src/index";

interface WalletRecord {
  id: string;
  organizationId: string;
  balanceCache: bigint;
  version: number;
}

interface LedgerEntryRecord {
  id: string;
  walletId: string;
  type: string;
  amountCredits: bigint;
  balanceAfter: bigint;
  idempotencyKey: string;
  referenceType?: string | null;
  referenceId?: string | null;
  reversalOfId?: string | null;
  description?: string | null;
  metadata?: unknown;
  createdAt: Date;
  reversedBy?: LedgerEntryRecord | null;
}

interface GenerationJobRecord {
  id: string;
  status: string;
  reservedCredits: bigint;
  chargedCredits: bigint;
}

function createMockTx(initialData?: {
  wallets?: WalletRecord[];
  entries?: LedgerEntryRecord[];
  jobs?: GenerationJobRecord[];
}) {
  const wallets = new Map<string, WalletRecord>(
    (initialData?.wallets ?? []).map((w) => [w.id, { ...w }]),
  );
  const entries: LedgerEntryRecord[] = (initialData?.entries ?? []).map(
    (e) => ({
      ...e,
    }),
  );
  const jobs = new Map<string, GenerationJobRecord>(
    (initialData?.jobs ?? []).map((j) => [j.id, { ...j }]),
  );

  let idCounter = 1;
  const generateId = (prefix: string) => `${prefix}_${idCounter++}`;

  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    wallet: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const found = wallets.get(where.id);
        return found ? { ...found } : null;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { balanceCache?: bigint; version?: { increment: number } };
        }) => {
          const found = wallets.get(where.id);
          if (!found) throw new Error("Wallet not found in mock update");
          if (data.balanceCache !== undefined) {
            found.balanceCache = data.balanceCache;
          }
          if (data.version?.increment) {
            found.version += data.version.increment;
          }
          return { ...found };
        },
      ),
    },
    ledgerEntry: {
      findUnique: vi.fn(
        async ({ where }: { where: { idempotencyKey?: string } }) => {
          if (where.idempotencyKey) {
            const found = entries.find(
              (e) => e.idempotencyKey === where.idempotencyKey,
            );
            return found ? { ...found } : null;
          }
          return null;
        },
      ),
      findFirst: vi.fn(
        async ({
          where,
          include,
        }: {
          where: {
            walletId?: string;
            referenceType?: string;
            referenceId?: string;
            type?: string;
          };
          include?: { reversedBy?: boolean };
        }) => {
          const found = entries.find((e) => {
            if (where.walletId && e.walletId !== where.walletId) return false;
            if (where.referenceType && e.referenceType !== where.referenceType)
              return false;
            if (where.referenceId && e.referenceId !== where.referenceId)
              return false;
            if (where.type && e.type !== where.type) return false;
            return true;
          });
          if (!found) return null;

          const copy = { ...found };
          if (include?.reversedBy) {
            const rev = entries.find((e) => e.reversalOfId === found.id);
            copy.reversedBy = rev ? { ...rev } : null;
          }
          return copy;
        },
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: Omit<LedgerEntryRecord, "id" | "createdAt" | "reversedBy">;
        }) => {
          const newEntry: LedgerEntryRecord = {
            id: generateId("entry"),
            createdAt: new Date(),
            reversedBy: null,
            ...data,
          };
          entries.push(newEntry);
          return { ...newEntry };
        },
      ),
    },
    generationJob: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const found = jobs.get(where.id);
        return found ? { ...found } : null;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<GenerationJobRecord>;
        }) => {
          const found = jobs.get(where.id);
          if (!found) throw new Error("Job not found in mock update");
          Object.assign(found, data);
          return { ...found };
        },
      ),
    },
  };

  return {
    tx: tx as unknown as Prisma.TransactionClient,
    getWallet: (id: string) => wallets.get(id),
    getEntries: () => entries,
    getJob: (id: string) => jobs.get(id),
  };
}

describe("Transactional Ledger Mutations", () => {
  const testWalletId = "wallet_1";
  const testJobId = "job_1";

  it("reserves credits successfully and updates wallet balance cache", async () => {
    const mock = createMockTx({
      wallets: [
        {
          id: testWalletId,
          organizationId: "org_1",
          balanceCache: 100n,
          version: 0,
        },
      ],
      jobs: [
        {
          id: testJobId,
          status: "QUOTED",
          reservedCredits: 0n,
          chargedCredits: 0n,
        },
      ],
    });

    const entry = await reserveCreditsForJob(mock.tx, {
      walletId: testWalletId,
      amountCredits: 28n,
      idempotencyKey: "idem_res_1",
      jobId: testJobId,
    });

    expect(entry.type).toBe("RESERVATION");
    expect(entry.amountCredits).toBe(28n);
    expect(entry.balanceAfter).toBe(72n);
    expect(entry.referenceId).toBe(testJobId);

    const updatedWallet = mock.getWallet(testWalletId);
    expect(updatedWallet?.balanceCache).toBe(72n);
    expect(updatedWallet?.version).toBe(1);

    const updatedJob = mock.getJob(testJobId);
    expect(updatedJob?.status).toBe("CREDIT_RESERVED");
    expect(updatedJob?.reservedCredits).toBe(28n);
  });

  it("throws InsufficientCreditsError when balance is less than required", async () => {
    const mock = createMockTx({
      wallets: [
        {
          id: testWalletId,
          organizationId: "org_1",
          balanceCache: 20n,
          version: 0,
        },
      ],
    });

    await expect(
      reserveCreditsForJob(mock.tx, {
        walletId: testWalletId,
        amountCredits: 28n,
        idempotencyKey: "idem_res_2",
        jobId: testJobId,
      }),
    ).rejects.toThrow(InsufficientCreditsError);

    // Balance must remain intact
    expect(mock.getWallet(testWalletId)?.balanceCache).toBe(20n);
  });

  it("returns existing entry on idempotent reservation retry", async () => {
    const mock = createMockTx({
      wallets: [
        {
          id: testWalletId,
          organizationId: "org_1",
          balanceCache: 100n,
          version: 0,
        },
      ],
    });

    const first = await reserveCreditsForJob(mock.tx, {
      walletId: testWalletId,
      amountCredits: 28n,
      idempotencyKey: "idem_res_dup",
      jobId: testJobId,
    });

    const second = await reserveCreditsForJob(mock.tx, {
      walletId: testWalletId,
      amountCredits: 28n,
      idempotencyKey: "idem_res_dup",
      jobId: testJobId,
    });

    expect(second.id).toBe(first.id);
    expect(mock.getWallet(testWalletId)?.balanceCache).toBe(72n);
    expect(mock.getEntries().length).toBe(1);
  });

  it("throws IdempotencyConflictError when key is reused with different amount", async () => {
    const mock = createMockTx({
      wallets: [
        {
          id: testWalletId,
          organizationId: "org_1",
          balanceCache: 100n,
          version: 0,
        },
      ],
    });

    await reserveCreditsForJob(mock.tx, {
      walletId: testWalletId,
      amountCredits: 28n,
      idempotencyKey: "idem_conflict",
      jobId: testJobId,
    });

    await expect(
      reserveCreditsForJob(mock.tx, {
        walletId: testWalletId,
        amountCredits: 50n,
        idempotencyKey: "idem_conflict",
        jobId: testJobId,
      }),
    ).rejects.toThrow(IdempotencyConflictError);
  });

  it("captures credits exactly without altering already-reserved balanceCache", async () => {
    const mock = createMockTx({
      wallets: [
        {
          id: testWalletId,
          organizationId: "org_1",
          balanceCache: 72n,
          version: 1,
        },
      ],
      entries: [
        {
          id: "entry_res_1",
          walletId: testWalletId,
          type: "RESERVATION",
          amountCredits: 28n,
          balanceAfter: 72n,
          idempotencyKey: "idem_res_1",
          referenceType: "GENERATION_JOB",
          referenceId: testJobId,
          createdAt: new Date(),
        },
      ],
      jobs: [
        {
          id: testJobId,
          status: "PROCESSING",
          reservedCredits: 28n,
          chargedCredits: 0n,
        },
      ],
    });

    const capture = await captureCreditsForJob(mock.tx, {
      walletId: testWalletId,
      amountCredits: 28n,
      idempotencyKey: "idem_cap_1",
      jobId: testJobId,
    });

    expect(capture.type).toBe("CAPTURE");
    expect(capture.amountCredits).toBe(28n);
    expect(capture.balanceAfter).toBe(72n);

    // Balance cache remains 72n since 28n was already deducted at reservation
    expect(mock.getWallet(testWalletId)?.balanceCache).toBe(72n);
    expect(mock.getJob(testJobId)?.chargedCredits).toBe(28n);
  });

  it("partially captures credits and refunds unused portion to balanceCache", async () => {
    const mock = createMockTx({
      wallets: [
        {
          id: testWalletId,
          organizationId: "org_1",
          balanceCache: 72n, // 100 - 28
          version: 1,
        },
      ],
      entries: [
        {
          id: "entry_res_1",
          walletId: testWalletId,
          type: "RESERVATION",
          amountCredits: 28n,
          balanceAfter: 72n,
          idempotencyKey: "idem_res_1",
          referenceType: "GENERATION_JOB",
          referenceId: testJobId,
          createdAt: new Date(),
        },
      ],
    });

    // Captured only 20 credits out of 28 reserved -> 8 credits restored
    const capture = await captureCreditsForJob(mock.tx, {
      walletId: testWalletId,
      amountCredits: 20n,
      idempotencyKey: "idem_cap_part",
      jobId: testJobId,
    });

    expect(capture.type).toBe("CAPTURE");
    expect(capture.amountCredits).toBe(20n);
    expect(capture.balanceAfter).toBe(80n);
    expect(mock.getWallet(testWalletId)?.balanceCache).toBe(80n);
  });

  it("throws ReservationNotFoundError when capturing without prior reservation", async () => {
    const mock = createMockTx({
      wallets: [
        {
          id: testWalletId,
          organizationId: "org_1",
          balanceCache: 100n,
          version: 0,
        },
      ],
    });

    await expect(
      captureCreditsForJob(mock.tx, {
        walletId: testWalletId,
        amountCredits: 28n,
        idempotencyKey: "idem_cap_none",
        jobId: "unknown_job",
      }),
    ).rejects.toThrow(ReservationNotFoundError);
  });

  it("releases reserved credits upon job failure and links reversalOfId", async () => {
    const mock = createMockTx({
      wallets: [
        {
          id: testWalletId,
          organizationId: "org_1",
          balanceCache: 72n,
          version: 1,
        },
      ],
      entries: [
        {
          id: "entry_res_1",
          walletId: testWalletId,
          type: "RESERVATION",
          amountCredits: 28n,
          balanceAfter: 72n,
          idempotencyKey: "idem_res_1",
          referenceType: "GENERATION_JOB",
          referenceId: testJobId,
          createdAt: new Date(),
        },
      ],
      jobs: [
        {
          id: testJobId,
          status: "CREDIT_RESERVED",
          reservedCredits: 28n,
          chargedCredits: 0n,
        },
      ],
    });

    const release = await releaseOrRefundCredits(mock.tx, {
      walletId: testWalletId,
      jobId: testJobId,
      reason: "Provider timed out",
    });

    expect(release.type).toBe("RELEASE");
    expect(release.amountCredits).toBe(28n);
    expect(release.balanceAfter).toBe(100n);
    expect(release.reversalOfId).toBe("entry_res_1");
    expect(release.description).toBe("Provider timed out");

    // Wallet balance restored
    expect(mock.getWallet(testWalletId)?.balanceCache).toBe(100n);
    expect(mock.getJob(testJobId)?.reservedCredits).toBe(0n);
  });

  it("refunds captured credits when refunding a completed job", async () => {
    const mock = createMockTx({
      wallets: [
        {
          id: testWalletId,
          organizationId: "org_1",
          balanceCache: 72n,
          version: 2,
        },
      ],
      entries: [
        {
          id: "entry_res_1",
          walletId: testWalletId,
          type: "RESERVATION",
          amountCredits: 28n,
          balanceAfter: 72n,
          idempotencyKey: "idem_res_1",
          referenceType: "GENERATION_JOB",
          referenceId: testJobId,
          createdAt: new Date(),
        },
        {
          id: "entry_cap_1",
          walletId: testWalletId,
          type: "CAPTURE",
          amountCredits: 28n,
          balanceAfter: 72n,
          idempotencyKey: "idem_cap_1",
          referenceType: "GENERATION_JOB",
          referenceId: testJobId,
          createdAt: new Date(),
        },
      ],
    });

    const refund = await releaseOrRefundCredits(mock.tx, {
      walletId: testWalletId,
      jobId: testJobId,
      reason: "Customer requested refund due to defective audio generation",
    });

    expect(refund.type).toBe("REFUND");
    expect(refund.amountCredits).toBe(28n);
    expect(refund.balanceAfter).toBe(100n);
    expect(refund.reversalOfId).toBe("entry_cap_1");

    expect(mock.getWallet(testWalletId)?.balanceCache).toBe(100n);
  });

  it("rejects duplicate release or refund when already settled", async () => {
    const mock = createMockTx({
      wallets: [
        {
          id: testWalletId,
          organizationId: "org_1",
          balanceCache: 100n,
          version: 2,
        },
      ],
      entries: [
        {
          id: "entry_res_1",
          walletId: testWalletId,
          type: "RESERVATION",
          amountCredits: 28n,
          balanceAfter: 72n,
          idempotencyKey: "idem_res_1",
          referenceType: "GENERATION_JOB",
          referenceId: testJobId,
          createdAt: new Date(),
        },
        {
          id: "entry_rel_1",
          walletId: testWalletId,
          type: "RELEASE",
          amountCredits: 28n,
          balanceAfter: 100n,
          idempotencyKey: "idem_rel_1",
          reversalOfId: "entry_res_1",
          referenceType: "GENERATION_JOB",
          referenceId: testJobId,
          createdAt: new Date(),
        },
      ],
    });

    await expect(
      releaseOrRefundCredits(mock.tx, {
        walletId: testWalletId,
        jobId: testJobId,
        reason: "Second cancellation attempt",
      }),
    ).rejects.toThrow(ReservationAlreadySettledError);
  });

  it("grants credits via PAYMENT_GRANT and ADMIN_GRANT", async () => {
    const mock = createMockTx({
      wallets: [
        {
          id: testWalletId,
          organizationId: "org_1",
          balanceCache: 0n,
          version: 0,
        },
      ],
    });

    const paymentGrant = await grantCredits(mock.tx, {
      walletId: testWalletId,
      amountCredits: 500n,
      type: "PAYMENT_GRANT",
      idempotencyKey: "pay_grant_1",
      referenceType: "MANUAL_PAYMENT",
      referenceId: "pay_1",
    });

    expect(paymentGrant.type).toBe("PAYMENT_GRANT");
    expect(paymentGrant.amountCredits).toBe(500n);
    expect(paymentGrant.balanceAfter).toBe(500n);
    expect(mock.getWallet(testWalletId)?.balanceCache).toBe(500n);

    const adminGrant = await grantCredits(mock.tx, {
      walletId: testWalletId,
      amountCredits: 50n,
      type: "ADMIN_GRANT",
      idempotencyKey: "admin_grant_1",
    });

    expect(adminGrant.type).toBe("ADMIN_GRANT");
    expect(adminGrant.amountCredits).toBe(50n);
    expect(adminGrant.balanceAfter).toBe(550n);
    expect(mock.getWallet(testWalletId)?.balanceCache).toBe(550n);
  });

  it("enforces non-negative and non-zero invariants with InvalidAmountError", async () => {
    const mock = createMockTx({
      wallets: [
        {
          id: testWalletId,
          organizationId: "org_1",
          balanceCache: 100n,
          version: 0,
        },
      ],
    });

    await expect(
      reserveCreditsForJob(mock.tx, {
        walletId: testWalletId,
        amountCredits: 0n,
        idempotencyKey: "zero_res",
        jobId: testJobId,
      }),
    ).rejects.toThrow(InvalidAmountError);

    await expect(
      grantCredits(mock.tx, {
        walletId: testWalletId,
        amountCredits: 0n,
        type: "ADMIN_GRANT",
        idempotencyKey: "zero_grant",
      }),
    ).rejects.toThrow(InvalidAmountError);

    await expect(
      reserveCreditsForJob(mock.tx, {
        walletId: testWalletId,
        amountCredits: -10n,
        idempotencyKey: "neg_res",
        jobId: testJobId,
      }),
    ).rejects.toThrow(RangeError);
  });

  it("queries current wallet balance", async () => {
    const mock = createMockTx({
      wallets: [
        {
          id: testWalletId,
          organizationId: "org_1",
          balanceCache: 350n,
          version: 3,
        },
      ],
    });

    const balance = await getWalletBalance(mock.tx, testWalletId);
    expect(balance).toBe(350n);

    await expect(getWalletBalance(mock.tx, "non_existent")).rejects.toThrow(
      WalletNotFoundError,
    );
  });
});
