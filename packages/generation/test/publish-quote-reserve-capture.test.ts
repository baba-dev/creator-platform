import { describe, expect, it, vi } from "vitest";
import {
  createCreditQuote,
  DEFAULT_FX_RATE,
  type CreditQuote,
} from "@aiwa/credits";
import { captureCreditsForJob, reserveCreditsForJob } from "@aiwa/credits";
import {
  calculateBillableUnits,
  calculateVideoPricing,
  countBillableCharacters,
} from "@aiwa/credits";
import { priceCredits } from "../src/index";

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

function createMockLedgerTx(initialData: {
  wallet: WalletRecord;
  job: GenerationJobRecord;
}) {
  const wallet: WalletRecord = { ...initialData.wallet };
  const job: GenerationJobRecord = { ...initialData.job };
  const entries: LedgerEntryRecord[] = [];
  let idCounter = 1;

  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    wallet: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id === wallet.id) return { ...wallet };
        return null;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { balanceCache?: bigint; version?: { increment: number } };
        }) => {
          if (where.id !== wallet.id) throw new Error("Wallet not found");
          if (data.balanceCache !== undefined) {
            wallet.balanceCache = data.balanceCache;
          }
          if (data.version?.increment) {
            wallet.version += data.version.increment;
          }
          return { ...wallet };
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
        }: {
          where: {
            walletId?: string;
            referenceType?: string;
            referenceId?: string;
            type?: string;
          };
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
          return found ? { ...found } : null;
        },
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: Omit<LedgerEntryRecord, "id" | "createdAt">;
        }) => {
          const created: LedgerEntryRecord = {
            ...data,
            id: `entry_${idCounter++}`,
            createdAt: new Date(),
          };
          entries.push(created);
          return { ...created };
        },
      ),
    },
    generationJob: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id === job.id) return { ...job };
        return null;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<GenerationJobRecord>;
        }) => {
          if (where.id !== job.id) throw new Error("Job not found");
          Object.assign(job, data);
          return { ...job };
        },
      ),
    },
  };

  return {
    tx: tx as unknown as Parameters<typeof reserveCreditsForJob>[0],
    getWallet: () => ({ ...wallet }),
    getJob: () => ({ ...job }),
    getEntries: () => [...entries],
  };
}

describe("Publish → Quote → Reserve → Capture Pricing Consistency", () => {
  it("strictly preserves credit pricing across all 4 stages with a non-default creditsPerBaisa snapshot", async () => {
    // -------------------------------------------------------------------------
    // STAGE 1: PUBLISH
    // Administrator configures a model price version with a non-default conversion rate (3 credits / baisa)
    // -------------------------------------------------------------------------
    const nonDefaultCreditsPerBaisa = 3n;
    const providerCostMicroUsd = 100_000n; // $0.10
    const targetMarginBps = 2_500; // 25% margin

    const publishedQuote: CreditQuote = createCreditQuote({
      providerCostMicroUsd,
      exchangeRate: DEFAULT_FX_RATE,
      targetGrossMarginBps: targetMarginBps,
      creditsPerBaisa: nonDefaultCreditsPerBaisa,
    });

    // 100,000 * 769 / (2 * 1,000,000) = 38.45 -> 39 baisa converted cost
    // 39 * 10,000 / (10,000 - 2,500) = 390,000 / 7,500 = 52 baisa customer price
    // 52 baisa * 3 credits/baisa = 156 credits
    expect(publishedQuote.convertedCostBaisa).toBe(39n);
    expect(publishedQuote.customerPriceBaisa).toBe(52n);
    expect(publishedQuote.customerCredits).toBe(156n);
    expect(publishedQuote.creditsPerBaisa).toBe(3n);

    // Stored ModelPriceVersion entity in database snapshot:
    const modelPriceVersion = {
      id: "price_version_xyz",
      providerModelId: "model_seedream_v5",
      providerCostMicroUsd,
      customerCredits: publishedQuote.customerCredits, // 156n
      fxBaisaNumerator: DEFAULT_FX_RATE.baisaNumerator,
      fxBaisaDenominator: DEFAULT_FX_RATE.baisaDenominator,
      targetMarginBps,
      creditsPerBaisa: nonDefaultCreditsPerBaisa, // Persisted snapshot
      pricingDimension: "REQUEST" as const,
      unitQuantity: 1,
    };

    // -------------------------------------------------------------------------
    // STAGE 2: QUOTE
    // Customer requests a quote for 1 unit; quote endpoint reads the priceVersion snapshot
    // -------------------------------------------------------------------------
    const units = 1;
    const scaledCost = modelPriceVersion.providerCostMicroUsd * BigInt(units);

    // Honoring the persisted conversion snapshot from the price version:
    const quoted = createCreditQuote({
      providerCostMicroUsd: scaledCost,
      exchangeRate: {
        baisaNumerator: modelPriceVersion.fxBaisaNumerator,
        baisaDenominator: modelPriceVersion.fxBaisaDenominator,
      },
      targetGrossMarginBps: modelPriceVersion.targetMarginBps,
      creditsPerBaisa: modelPriceVersion.creditsPerBaisa,
    });

    // CONSISTENCY CHECK 1: Quoted credits MUST equal published customerCredits
    expect(quoted.customerCredits).toBe(modelPriceVersion.customerCredits);
    expect(quoted.customerCredits).toBe(156n);
    expect(quoted.creditsPerBaisa).toBe(nonDefaultCreditsPerBaisa);

    // -------------------------------------------------------------------------
    // STAGE 3: RESERVE
    // Customer creates a generation job; system reserves wallet credits using priceCredits
    // -------------------------------------------------------------------------
    const initialBalance = 1_000n;
    const mock = createMockLedgerTx({
      wallet: {
        id: "wallet_1",
        organizationId: "org_1",
        balanceCache: initialBalance,
        version: 1,
      },
      job: {
        id: "job_1",
        status: "DRAFT",
        reservedCredits: 0n,
        chargedCredits: 0n,
      },
    });

    // Generation package calculates reservation credits from priceVersion snapshot:
    const reservedAmount = priceCredits(modelPriceVersion);

    // CONSISTENCY CHECK 2: Reserved calculation MUST equal quoted and published credits
    expect(reservedAmount).toBe(quoted.customerCredits);
    expect(reservedAmount).toBe(156n);

    // Reserve in wallet ledger:
    const reservationEntry = await reserveCreditsForJob(mock.tx, {
      walletId: "wallet_1",
      jobId: "job_1",
      amountCredits: reservedAmount,
      idempotencyKey: "reserve-job-1",
    });

    expect(reservationEntry.type).toBe("RESERVATION");
    expect(reservationEntry.amountCredits).toBe(156n);
    expect(reservationEntry.balanceAfter).toBe(initialBalance - 156n); // 844n
    expect(mock.getWallet().balanceCache).toBe(844n);
    expect(mock.getJob().reservedCredits).toBe(156n);
    expect(mock.getJob().status).toBe("CREDIT_RESERVED");

    // -------------------------------------------------------------------------
    // STAGE 4: CAPTURE
    // Job processing succeeds; worker captures the reserved credits
    // -------------------------------------------------------------------------
    const currentJob = mock.getJob();
    const captureEntry = await captureCreditsForJob(mock.tx, {
      walletId: "wallet_1",
      jobId: "job_1",
      amountCredits: currentJob.reservedCredits,
      idempotencyKey: "capture-job-1",
    });

    // CONSISTENCY CHECK 3: Captured credits MUST equal reserved, quoted, and published credits
    expect(captureEntry.type).toBe("CAPTURE");
    expect(captureEntry.amountCredits).toBe(156n);
    expect(captureEntry.amountCredits).toBe(modelPriceVersion.customerCredits);
    expect(mock.getJob().chargedCredits).toBe(156n);

    // Wallet balance is unchanged by capture since it was debited on reservation:
    expect(mock.getWallet().balanceCache).toBe(initialBalance - 156n);

    // -------------------------------------------------------------------------
    // SUMMARY CONSISTENCY ASSERTION:
    // Published === Quoted === Reserved === Captured === 156n
    // -------------------------------------------------------------------------
    expect(modelPriceVersion.customerCredits).toBe(156n);
    expect(quoted.customerCredits).toBe(156n);
    expect(mock.getJob().reservedCredits).toBe(156n);
    expect(mock.getJob().chargedCredits).toBe(156n);
  });

  it("proves the regression: hardcoding creditsPerBaisa to 1n produces a severe pricing discrepancy", () => {
    const nonDefaultCreditsPerBaisa = 3n;
    const providerCostMicroUsd = 100_000n;
    const targetMarginBps = 2_500;

    // What the administrator configured and published:
    const published = createCreditQuote({
      providerCostMicroUsd,
      exchangeRate: DEFAULT_FX_RATE,
      targetGrossMarginBps: targetMarginBps,
      creditsPerBaisa: nonDefaultCreditsPerBaisa,
    });
    expect(published.customerCredits).toBe(156n);

    // The legacy faulty behavior: hardcoded 1n in quoting and priceCredits:
    const faultyQuote = createCreditQuote({
      providerCostMicroUsd,
      exchangeRate: DEFAULT_FX_RATE,
      targetGrossMarginBps: targetMarginBps,
      creditsPerBaisa: 1n, // BUG: hardcoded
    });
    expect(faultyQuote.customerCredits).toBe(52n);

    // In the broken implementation, published credit price and quoted/charged price disagreed by 104 credits!
    expect(faultyQuote.customerCredits).not.toBe(published.customerCredits);
    expect(published.customerCredits - faultyQuote.customerCredits).toBe(104n);

    // But with our fix (passing modelPriceVersion.creditsPerBaisa):
    const fixedQuote = createCreditQuote({
      providerCostMicroUsd,
      exchangeRate: DEFAULT_FX_RATE,
      targetGrossMarginBps: targetMarginBps,
      creditsPerBaisa: nonDefaultCreditsPerBaisa,
    });
    expect(fixedQuote.customerCredits).toBe(published.customerCredits);
  });

  it("preserves consistency across all stages for multi-unit character voice pricing", async () => {
    // Character pricing: $0.030 per 1,000 characters with creditsPerBaisa = 2n
    const creditsPerBaisa = 2n;
    const costPerThousand = 30_000n;
    const targetMarginBps = 2_500;

    // Published 1-unit baseline price version:
    const publishedBase = createCreditQuote({
      providerCostMicroUsd: costPerThousand,
      exchangeRate: DEFAULT_FX_RATE,
      targetGrossMarginBps: targetMarginBps,
      creditsPerBaisa,
    });
    // 30,000 * 769 / 2,000,000 = 11.535 -> 12 baisa
    // 12 * 10,000 / 7,500 = 16 baisa
    // 16 * 2 = 32 credits per 1,000 characters
    expect(publishedBase.customerCredits).toBe(32n);

    const voicePriceVersion = {
      id: "voice_price_1",
      providerModelId: "seed-tts-2.0",
      providerCostMicroUsd: costPerThousand,
      customerCredits: publishedBase.customerCredits,
      fxBaisaNumerator: DEFAULT_FX_RATE.baisaNumerator,
      fxBaisaDenominator: DEFAULT_FX_RATE.baisaDenominator,
      targetMarginBps,
      creditsPerBaisa,
      pricingDimension: "CHARACTER" as const,
      unitQuantity: 1000,
    };

    // User synthesizes 2,500 characters -> 3 billable units of 1,000
    const text = "A".repeat(2500);
    const chars = countBillableCharacters(text);
    const units = calculateBillableUnits(chars, voicePriceVersion.unitQuantity);
    expect(units).toBe(3n);

    const scaledCost = voicePriceVersion.providerCostMicroUsd * units; // 90,000 micro-USD

    // Quote calculation honoring snapshot conversion:
    const quoted = createCreditQuote({
      providerCostMicroUsd: scaledCost,
      exchangeRate: {
        baisaNumerator: voicePriceVersion.fxBaisaNumerator,
        baisaDenominator: voicePriceVersion.fxBaisaDenominator,
      },
      targetGrossMarginBps: voicePriceVersion.targetMarginBps,
      creditsPerBaisa: voicePriceVersion.creditsPerBaisa,
    });
    // 90,000 * 769 / 2,000,000 = 34.605 -> 35 baisa
    // 35 * 10,000 / 7,500 = 46.666 -> 47 baisa
    // 47 * 2 = 94 credits
    expect(quoted.customerCredits).toBe(94n);

    // Reservation using priceCredits with scaled cost:
    const reservedCredits = priceCredits({
      ...voicePriceVersion,
      providerCostMicroUsd: scaledCost,
    });
    expect(reservedCredits).toBe(quoted.customerCredits);
    expect(reservedCredits).toBe(94n);

    // Ledger reserve & capture:
    const mock = createMockLedgerTx({
      wallet: {
        id: "wallet_v",
        organizationId: "org_v",
        balanceCache: 500n,
        version: 1,
      },
      job: {
        id: "job_v",
        status: "DRAFT",
        reservedCredits: 0n,
        chargedCredits: 0n,
      },
    });

    await reserveCreditsForJob(mock.tx, {
      walletId: "wallet_v",
      jobId: "job_v",
      amountCredits: reservedCredits,
      idempotencyKey: "reserve-voice-job",
    });
    expect(mock.getJob().reservedCredits).toBe(94n);

    await captureCreditsForJob(mock.tx, {
      walletId: "wallet_v",
      jobId: "job_v",
      amountCredits: mock.getJob().reservedCredits,
      idempotencyKey: "capture-voice-job",
    });

    expect(mock.getJob().chargedCredits).toBe(94n);
    expect(mock.getWallet().balanceCache).toBe(500n - 94n);
  });

  it("strictly enforces parameter-sensitive video pricing across Publish → Quote → Reserve → Capture for 5s vs 10s requests", async () => {
    // -------------------------------------------------------------------------
    // STAGE 1: PUBLISH
    // Seedance 2.5 is published with SECOND pricing dimension (5s base unit)
    // -------------------------------------------------------------------------
    const seedancePriceVersion = {
      id: "price_seedance_25",
      providerModelId: "model_seedance_25",
      providerCostMicroUsd: 468_000n, // $0.468 per 5-second unit
      customerCredits: 240n,
      fxBaisaNumerator: 769n,
      fxBaisaDenominator: 2n,
      targetMarginBps: 2500,
      creditsPerBaisa: 1n,
      pricingDimension: "SECOND" as const,
      unitQuantity: 5,
    };

    // -------------------------------------------------------------------------
    // STAGE 2: QUOTE (5s vs 10s vs 10s 1080p + audio)
    // -------------------------------------------------------------------------
    // Request 1: 5s, 720p, no audio
    const quote5s = calculateVideoPricing({
      providerCostMicroUsd: seedancePriceVersion.providerCostMicroUsd,
      durationSeconds: 5,
      resolution: "720p",
      generateAudio: false,
      pricingDimension: seedancePriceVersion.pricingDimension,
      unitQuantity: seedancePriceVersion.unitQuantity,
      exchangeRate: {
        baisaNumerator: seedancePriceVersion.fxBaisaNumerator,
        baisaDenominator: seedancePriceVersion.fxBaisaDenominator,
      },
      targetGrossMarginBps: seedancePriceVersion.targetMarginBps,
      creditsPerBaisa: seedancePriceVersion.creditsPerBaisa,
    });
    expect(quote5s.durationUnits).toBe(1n);
    expect(quote5s.quote.customerCredits).toBe(240n);

    // Request 2: 10s, 720p, no audio (2x duration units)
    const quote10s = calculateVideoPricing({
      providerCostMicroUsd: seedancePriceVersion.providerCostMicroUsd,
      durationSeconds: 10,
      resolution: "720p",
      generateAudio: false,
      pricingDimension: seedancePriceVersion.pricingDimension,
      unitQuantity: seedancePriceVersion.unitQuantity,
      exchangeRate: {
        baisaNumerator: seedancePriceVersion.fxBaisaNumerator,
        baisaDenominator: seedancePriceVersion.fxBaisaDenominator,
      },
      targetGrossMarginBps: seedancePriceVersion.targetMarginBps,
      creditsPerBaisa: seedancePriceVersion.creditsPerBaisa,
    });
    expect(quote10s.durationUnits).toBe(2n);
    expect(quote10s.quote.customerCredits).toBe(480n);
    // CRITICAL: 10s request charges exactly 2x 5s request
    expect(quote10s.quote.customerCredits).toBe(
      quote5s.quote.customerCredits * 2n,
    );

    // Request 3: 10s, 1080p (1.5x), with audio (1.2x) -> 3.6x composite
    const quote10sHdAudio = calculateVideoPricing({
      providerCostMicroUsd: seedancePriceVersion.providerCostMicroUsd,
      durationSeconds: 10,
      resolution: "1080p",
      generateAudio: true,
      pricingDimension: seedancePriceVersion.pricingDimension,
      unitQuantity: seedancePriceVersion.unitQuantity,
      exchangeRate: {
        baisaNumerator: seedancePriceVersion.fxBaisaNumerator,
        baisaDenominator: seedancePriceVersion.fxBaisaDenominator,
      },
      targetGrossMarginBps: seedancePriceVersion.targetMarginBps,
      creditsPerBaisa: seedancePriceVersion.creditsPerBaisa,
    });
    expect(quote10sHdAudio.quote.customerCredits).toBe(864n);

    // -------------------------------------------------------------------------
    // STAGE 3 & 4: RESERVE & CAPTURE FOR 10-SECOND REQUEST
    // -------------------------------------------------------------------------
    const mock = createMockLedgerTx({
      wallet: {
        id: "wallet_video",
        organizationId: "org_video",
        balanceCache: 1000n,
        version: 1,
      },
      job: {
        id: "job_video_10s",
        status: "DRAFT",
        reservedCredits: 0n,
        chargedCredits: 0n,
      },
    });

    // System reserves 480 credits for 10-second request (NOT 240)
    await reserveCreditsForJob(mock.tx, {
      walletId: "wallet_video",
      jobId: "job_video_10s",
      amountCredits: quote10s.quote.customerCredits,
      idempotencyKey: "reserve-video-10s",
    });

    expect(mock.getJob().reservedCredits).toBe(480n);
    expect(mock.getWallet().balanceCache).toBe(1000n - 480n);

    // Capture upon successful completion:
    await captureCreditsForJob(mock.tx, {
      walletId: "wallet_video",
      jobId: "job_video_10s",
      amountCredits: mock.getJob().reservedCredits,
      idempotencyKey: "capture-video-10s",
    });

    expect(mock.getJob().chargedCredits).toBe(480n);
    expect(mock.getWallet().balanceCache).toBe(520n);
  });
});
