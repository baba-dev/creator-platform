import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@aiwa/db";

import {
  IdempotencyConflictError,
  InsufficientCreditsError,
  InvalidPaymentTransitionError,
  PaymentAlreadySettledError,
  PaymentNotFoundError,
  _confirmPaymentTx,
  _grantAdminCreditsTx,
  _recordPaymentTx,
  _rejectPaymentTx,
  _reversePaymentTx,
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
}

interface ManualPaymentRecord {
  id: string;
  organizationId: string;
  createdById: string;
  confirmedById?: string | null;
  method: string;
  status: string;
  amountBaisa: bigint;
  reference?: string | null;
  chequeNumber?: string | null;
  bankName?: string | null;
  notes?: string | null;
  receivedAt: Date;
  confirmedAt?: Date | null;
  rejectedAt?: Date | null;
  reversedAt?: Date | null;
  rejectionReason?: string | null;
  reversalReason?: string | null;
  creditsGranted?: bigint | null;
  creditsPerBaisa?: bigint | null;
  idempotencyKey: string;
  ledgerEntryId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AuditEventRecord {
  id: string;
  actorUserId?: string | null;
  organizationId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: unknown;
  createdAt: Date;
}

function createMockTx(initial?: {
  wallets?: WalletRecord[];
  payments?: ManualPaymentRecord[];
  entries?: LedgerEntryRecord[];
  audits?: AuditEventRecord[];
}) {
  const wallets = new Map<string, WalletRecord>(
    (initial?.wallets ?? []).map((w) => [w.id, { ...w }]),
  );
  const payments = new Map<string, ManualPaymentRecord>(
    (initial?.payments ?? []).map((p) => [p.id, { ...p }]),
  );
  const entries = new Map<string, LedgerEntryRecord>(
    (initial?.entries ?? []).map((e) => [e.id, { ...e }]),
  );
  const audits: AuditEventRecord[] = [...(initial?.audits ?? [])];

  let idSeq = 1000;
  const nextId = (prefix: string) => `${prefix}_${++idSeq}`;

  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    manualPayment: {
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: { id?: string; idempotencyKey?: string };
        }) => {
          if (where.id) {
            const p = payments.get(where.id);
            return p ? { ...p } : null;
          }
          if (where.idempotencyKey) {
            for (const p of payments.values()) {
              if (p.idempotencyKey === where.idempotencyKey) {
                return { ...p };
              }
            }
          }
          return null;
        },
      ),
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: { id?: string; idempotencyKey?: string };
        }) => {
          for (const p of payments.values()) {
            let match = true;
            if (where.id && p.id !== where.id) match = false;
            if (
              where.idempotencyKey &&
              p.idempotencyKey !== where.idempotencyKey
            )
              match = false;
            if (match) return { ...p };
          }
          return null;
        },
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: Omit<ManualPaymentRecord, "id" | "createdAt" | "updatedAt">;
        }) => {
          const id = nextId("pay");
          const record: ManualPaymentRecord = {
            id,
            organizationId: data.organizationId,
            createdById: data.createdById,
            confirmedById: data.confirmedById ?? null,
            method: data.method,
            status: data.status,
            amountBaisa: data.amountBaisa,
            reference: data.reference ?? null,
            chequeNumber: data.chequeNumber ?? null,
            bankName: data.bankName ?? null,
            notes: data.notes ?? null,
            receivedAt: data.receivedAt,
            confirmedAt: data.confirmedAt ?? null,
            rejectedAt: data.rejectedAt ?? null,
            reversedAt: data.reversedAt ?? null,
            rejectionReason: data.rejectionReason ?? null,
            reversalReason: data.reversalReason ?? null,
            creditsGranted: data.creditsGranted ?? null,
            creditsPerBaisa: data.creditsPerBaisa ?? null,
            idempotencyKey: data.idempotencyKey,
            ledgerEntryId: data.ledgerEntryId ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          payments.set(id, record);
          return { ...record };
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<ManualPaymentRecord>;
        }) => {
          const existing = payments.get(where.id);
          if (!existing) throw new Error("Payment not found");
          const updated: ManualPaymentRecord = {
            ...existing,
            ...data,
            updatedAt: new Date(),
          };
          payments.set(where.id, updated);
          return { ...updated };
        },
      ),
    },
    wallet: {
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: { id?: string; organizationId?: string };
        }) => {
          if (where.id) {
            const w = wallets.get(where.id);
            return w ? { ...w } : null;
          }
          if (where.organizationId) {
            for (const w of wallets.values()) {
              if (w.organizationId === where.organizationId) {
                return { ...w };
              }
            }
          }
          return null;
        },
      ),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
        const w = wallets.get(where.id);
        if (!w) throw new Error("Wallet not found");
        return { ...w };
      }),
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { organizationId: string };
          create: {
            organizationId: string;
            balanceCache?: bigint;
            version?: number;
          };
          update: Partial<WalletRecord>;
        }) => {
          for (const w of wallets.values()) {
            if (w.organizationId === where.organizationId) {
              const updated = { ...w, ...update };
              wallets.set(w.id, updated);
              return { ...updated };
            }
          }
          const id = nextId("wal");
          const record: WalletRecord = {
            id,
            organizationId: create.organizationId,
            balanceCache: create.balanceCache ?? 0n,
            version: create.version ?? 0,
          };
          wallets.set(id, record);
          return { ...record };
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: {
            balanceCache?: bigint;
            version?: { increment?: number } | number;
          };
        }) => {
          const existing = wallets.get(where.id);
          if (!existing) throw new Error("Wallet not found");
          const updated: WalletRecord = {
            ...existing,
            balanceCache: data.balanceCache ?? existing.balanceCache,
            version:
              data.version &&
              typeof data.version === "object" &&
              "increment" in data.version
                ? existing.version + 1
                : typeof data.version === "number"
                  ? data.version
                  : existing.version,
          };
          wallets.set(where.id, updated);
          return { ...updated };
        },
      ),
    },
    ledgerEntry: {
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: { id?: string; idempotencyKey?: string };
        }) => {
          if (where.id) {
            const e = entries.get(where.id);
            return e ? { ...e } : null;
          }
          if (where.idempotencyKey) {
            for (const e of entries.values()) {
              if (e.idempotencyKey === where.idempotencyKey) {
                return { ...e };
              }
            }
          }
          return null;
        },
      ),
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: { reversalOfId?: string; idempotencyKey?: string };
        }) => {
          for (const e of entries.values()) {
            let match = true;
            if (where.reversalOfId && e.reversalOfId !== where.reversalOfId)
              match = false;
            if (
              where.idempotencyKey &&
              e.idempotencyKey !== where.idempotencyKey
            )
              match = false;
            if (match) return { ...e };
          }
          return null;
        },
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: Omit<LedgerEntryRecord, "id" | "createdAt">;
        }) => {
          const id = nextId("led");
          const record: LedgerEntryRecord = {
            id,
            walletId: data.walletId,
            type: data.type,
            amountCredits: data.amountCredits,
            balanceAfter: data.balanceAfter,
            idempotencyKey: data.idempotencyKey,
            referenceType: data.referenceType ?? null,
            referenceId: data.referenceId ?? null,
            reversalOfId: data.reversalOfId ?? null,
            description: data.description ?? null,
            metadata: data.metadata ?? null,
            createdAt: new Date(),
          };
          entries.set(id, record);
          return { ...record };
        },
      ),
    },
    auditEvent: {
      create: vi.fn(
        async ({
          data,
        }: {
          data: Omit<AuditEventRecord, "id" | "createdAt">;
        }) => {
          const record: AuditEventRecord = {
            id: nextId("aud"),
            actorUserId: data.actorUserId ?? null,
            organizationId: data.organizationId ?? null,
            action: data.action,
            targetType: data.targetType,
            targetId: data.targetId ?? null,
            metadata: data.metadata ?? null,
            createdAt: new Date(),
          };
          audits.push(record);
          return { ...record };
        },
      ),
    },
  };

  return {
    tx: tx as unknown as Prisma.TransactionClient,
    getPayment: (id: string) => payments.get(id),
    getWallet: (id: string) => wallets.get(id),
    getEntry: (id: string) => entries.get(id),
    getAudits: () => audits,
  };
}

describe("@aiwa/payments", () => {
  const orgId = "org_test_1";
  const userId = "usr_admin_1";

  describe("recordPayment", () => {
    it("records a CASH payment as DRAFT", async () => {
      const mock = createMockTx();
      const payment = await _recordPaymentTx(mock.tx, {
        organizationId: orgId,
        createdById: userId,
        method: "CASH",
        amountBaisa: 5000n,
        receivedAt: new Date("2026-09-01"),
        reference: "REC-001",
        idempotencyKey: "idem_cash_1",
      });

      expect(payment.status).toBe("DRAFT");
      expect(payment.method).toBe("CASH");
      expect(payment.amountBaisa).toBe(5000n);
      expect(mock.getAudits()).toHaveLength(1);
      expect(mock.getAudits()[0]?.action).toBe("payment.recorded");
    });

    it("records a CHEQUE payment as PENDING", async () => {
      const mock = createMockTx();
      const payment = await _recordPaymentTx(mock.tx, {
        organizationId: orgId,
        createdById: userId,
        method: "CHEQUE",
        amountBaisa: 10000n,
        receivedAt: new Date("2026-09-01"),
        chequeNumber: "CHQ-999",
        bankName: "Bank Muscat",
        idempotencyKey: "idem_chq_1",
      });

      expect(payment.status).toBe("PENDING");
      expect(payment.method).toBe("CHEQUE");
      expect(payment.chequeNumber).toBe("CHQ-999");
    });

    it("safely replays idempotent recording requests", async () => {
      const mock = createMockTx();
      const first = await _recordPaymentTx(mock.tx, {
        organizationId: orgId,
        createdById: userId,
        method: "CASH",
        amountBaisa: 5000n,
        receivedAt: new Date("2026-09-01"),
        idempotencyKey: "idem_replay_1",
      });

      const second = await _recordPaymentTx(mock.tx, {
        organizationId: orgId,
        createdById: userId,
        method: "CASH",
        amountBaisa: 5000n,
        receivedAt: new Date("2026-09-01"),
        idempotencyKey: "idem_replay_1",
      });

      expect(second.id).toBe(first.id);
    });

    it("throws IdempotencyConflictError if parameters do not match", async () => {
      const mock = createMockTx();
      await _recordPaymentTx(mock.tx, {
        organizationId: orgId,
        createdById: userId,
        method: "CASH",
        amountBaisa: 5000n,
        receivedAt: new Date("2026-09-01"),
        idempotencyKey: "idem_conflict_1",
      });

      await expect(
        _recordPaymentTx(mock.tx, {
          organizationId: orgId,
          createdById: userId,
          method: "CASH",
          amountBaisa: 9999n, // Mismatch!
          receivedAt: new Date("2026-09-01"),
          idempotencyKey: "idem_conflict_1",
        }),
      ).rejects.toThrow(IdempotencyConflictError);
    });
  });

  describe("confirmPayment", () => {
    it("confirms a DRAFT payment, applies conversion rate snapshot, and credits wallet", async () => {
      const mock = createMockTx({
        payments: [
          {
            id: "pay_draft_1",
            organizationId: orgId,
            createdById: userId,
            method: "CASH",
            status: "DRAFT",
            amountBaisa: 2000n,
            receivedAt: new Date(),
            idempotencyKey: "idem_record_1",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        wallets: [
          {
            id: "wal_1",
            organizationId: orgId,
            balanceCache: 500n,
            version: 1,
          },
        ],
      });

      const result = await _confirmPaymentTx(mock.tx, {
        paymentId: "pay_draft_1",
        confirmedById: userId,
        creditsPerBaisa: 2n,
        idempotencyKey: "idem_confirm_1",
      });

      expect(result.payment.status).toBe("CONFIRMED");
      expect(result.payment.creditsGranted).toBe(4000n); // 2000 * 2
      expect(result.payment.creditsPerBaisa).toBe(2n);
      expect(result.ledgerEntry.type).toBe("PAYMENT_GRANT");
      expect(result.ledgerEntry.amountCredits).toBe(4000n);
      expect(result.ledgerEntry.balanceAfter).toBe(4500n); // 500 + 4000

      const wallet = mock.getWallet("wal_1");
      expect(wallet?.balanceCache).toBe(4500n);
    });

    it("confirms a PENDING cheque payment", async () => {
      const mock = createMockTx({
        payments: [
          {
            id: "pay_pending_1",
            organizationId: orgId,
            createdById: userId,
            method: "CHEQUE",
            status: "PENDING",
            amountBaisa: 1000n,
            receivedAt: new Date(),
            idempotencyKey: "idem_chq_rec",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      const result = await _confirmPaymentTx(mock.tx, {
        paymentId: "pay_pending_1",
        confirmedById: userId,
        creditsPerBaisa: 1n,
        idempotencyKey: "idem_confirm_chq",
      });

      expect(result.payment.status).toBe("CONFIRMED");
      expect(result.payment.creditsGranted).toBe(1000n);
    });

    it("throws PaymentNotFoundError for non-existent payment", async () => {
      const mock = createMockTx();
      await expect(
        _confirmPaymentTx(mock.tx, {
          paymentId: "missing_pay",
          confirmedById: userId,
          creditsPerBaisa: 1n,
          idempotencyKey: "idem_fail",
        }),
      ).rejects.toThrow(PaymentNotFoundError);
    });

    it("throws InvalidPaymentTransitionError when attempting to confirm REJECTED payment", async () => {
      const mock = createMockTx({
        payments: [
          {
            id: "pay_rejected_1",
            organizationId: orgId,
            createdById: userId,
            method: "CHEQUE",
            status: "REJECTED",
            amountBaisa: 1000n,
            receivedAt: new Date(),
            idempotencyKey: "idem_rej",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      await expect(
        _confirmPaymentTx(mock.tx, {
          paymentId: "pay_rejected_1",
          confirmedById: userId,
          creditsPerBaisa: 1n,
          idempotencyKey: "idem_reconfirm",
        }),
      ).rejects.toThrow(InvalidPaymentTransitionError);
    });
  });

  describe("rejectPayment", () => {
    it("rejects a PENDING cheque payment with reason", async () => {
      const mock = createMockTx({
        payments: [
          {
            id: "pay_chq_rej",
            organizationId: orgId,
            createdById: userId,
            method: "CHEQUE",
            status: "PENDING",
            amountBaisa: 3000n,
            receivedAt: new Date(),
            idempotencyKey: "idem_rec_rej",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      const rejected = await _rejectPaymentTx(mock.tx, {
        paymentId: "pay_chq_rej",
        actorUserId: userId,
        reason: "Signature mismatch on cheque leaf",
        idempotencyKey: "idem_action_rej",
      });

      expect(rejected.status).toBe("REJECTED");
      expect(rejected.rejectionReason).toBe(
        "Signature mismatch on cheque leaf",
      );
      expect(rejected.rejectedAt).toBeInstanceOf(Date);
    });

    it("throws InvalidPaymentTransitionError if trying to reject a DRAFT cash payment", async () => {
      const mock = createMockTx({
        payments: [
          {
            id: "pay_cash_draft",
            organizationId: orgId,
            createdById: userId,
            method: "CASH",
            status: "DRAFT",
            amountBaisa: 1000n,
            receivedAt: new Date(),
            idempotencyKey: "idem_cash_dr",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      await expect(
        _rejectPaymentTx(mock.tx, {
          paymentId: "pay_cash_draft",
          actorUserId: userId,
          reason: "Cash cannot be rejected",
          idempotencyKey: "idem_fail",
        }),
      ).rejects.toThrow(InvalidPaymentTransitionError);
    });
  });

  describe("reversePayment", () => {
    it("reverses a CONFIRMED payment, creates REVERSAL ledger entry, and debits wallet", async () => {
      const mock = createMockTx({
        payments: [
          {
            id: "pay_conf_1",
            organizationId: orgId,
            createdById: userId,
            method: "CASH",
            status: "CONFIRMED",
            amountBaisa: 2500n,
            creditsGranted: 2500n,
            creditsPerBaisa: 1n,
            ledgerEntryId: "led_grant_1",
            receivedAt: new Date(),
            idempotencyKey: "idem_rec_conf",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        wallets: [
          {
            id: "wal_1",
            organizationId: orgId,
            balanceCache: 3000n,
            version: 2,
          },
        ],
      });

      const result = await _reversePaymentTx(mock.tx, {
        paymentId: "pay_conf_1",
        actorUserId: userId,
        reason: "Erroneous duplicate entry",
        idempotencyKey: "idem_rev_1",
      });

      expect(result.payment.status).toBe("REVERSED");
      expect(result.payment.reversalReason).toBe("Erroneous duplicate entry");
      expect(result.ledgerEntry.type).toBe("REVERSAL");
      expect(result.ledgerEntry.amountCredits).toBe(2500n);
      expect(result.ledgerEntry.balanceAfter).toBe(500n); // 3000 - 2500
      expect(result.ledgerEntry.reversalOfId).toBe("led_grant_1");

      const wallet = mock.getWallet("wal_1");
      expect(wallet?.balanceCache).toBe(500n);
    });

    it("throws InsufficientCreditsError when wallet balance is less than creditsGranted", async () => {
      const mock = createMockTx({
        payments: [
          {
            id: "pay_conf_spent",
            organizationId: orgId,
            createdById: userId,
            method: "CASH",
            status: "CONFIRMED",
            amountBaisa: 2000n,
            creditsGranted: 2000n,
            creditsPerBaisa: 1n,
            ledgerEntryId: "led_grant_spent",
            receivedAt: new Date(),
            idempotencyKey: "idem_rec_spent",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        wallets: [
          {
            id: "wal_1",
            organizationId: orgId,
            balanceCache: 500n, // Less than 2000n creditsGranted!
            version: 3,
          },
        ],
      });

      await expect(
        _reversePaymentTx(mock.tx, {
          paymentId: "pay_conf_spent",
          actorUserId: userId,
          reason: "Chargeback",
          idempotencyKey: "idem_rev_fail",
        }),
      ).rejects.toThrow(InsufficientCreditsError);
    });

    it("throws InvalidPaymentTransitionError if trying to reverse a PENDING cheque", async () => {
      const mock = createMockTx({
        payments: [
          {
            id: "pay_pending_rev",
            organizationId: orgId,
            createdById: userId,
            method: "CHEQUE",
            status: "PENDING",
            amountBaisa: 1000n,
            receivedAt: new Date(),
            idempotencyKey: "idem_pending_rev",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      await expect(
        _reversePaymentTx(mock.tx, {
          paymentId: "pay_pending_rev",
          actorUserId: userId,
          reason: "Cannot reverse pending",
          idempotencyKey: "idem_fail",
        }),
      ).rejects.toThrow(InvalidPaymentTransitionError);
    });
  });

  describe("grantAdminCredits", () => {
    it("grants promotional credits directly to wallet with ADMIN_GRANT type", async () => {
      const mock = createMockTx({
        wallets: [
          {
            id: "wal_1",
            organizationId: orgId,
            balanceCache: 1000n,
            version: 1,
          },
        ],
      });

      const entry = await _grantAdminCreditsTx(mock.tx, {
        organizationId: orgId,
        actorUserId: userId,
        amountCredits: 250n,
        reason: "Marketing campaign onboarding bonus",
        idempotencyKey: "idem_promo_1",
      });

      expect(entry.type).toBe("ADMIN_GRANT");
      expect(entry.amountCredits).toBe(250n);
      expect(entry.balanceAfter).toBe(1250n);
      expect(mock.getWallet("wal_1")?.balanceCache).toBe(1250n);
    });

    it("replays existing admin grant safely on idempotent request", async () => {
      const mock = createMockTx();
      const first = await _grantAdminCreditsTx(mock.tx, {
        organizationId: orgId,
        actorUserId: userId,
        amountCredits: 500n,
        reason: "Partner credit",
        idempotencyKey: "idem_partner_1",
      });

      const second = await _grantAdminCreditsTx(mock.tx, {
        organizationId: orgId,
        actorUserId: userId,
        amountCredits: 500n,
        reason: "Partner credit",
        idempotencyKey: "idem_partner_1",
      });

      expect(second.id).toBe(first.id);
    });

    it("throws IdempotencyConflictError if existing grant has different amount", async () => {
      const mock = createMockTx();
      await _grantAdminCreditsTx(mock.tx, {
        organizationId: orgId,
        actorUserId: userId,
        amountCredits: 500n,
        reason: "Partner credit",
        idempotencyKey: "idem_partner_conf",
      });

      await expect(
        _grantAdminCreditsTx(mock.tx, {
          organizationId: orgId,
          actorUserId: userId,
          amountCredits: 1000n, // Different amount
          reason: "Partner credit",
          idempotencyKey: "idem_partner_conf",
        }),
      ).rejects.toThrow(IdempotencyConflictError);
    });
  });

  describe("reversals and rejections edge cases", () => {
    it("replays idempotent reverse request safely", async () => {
      const mock = createMockTx({
        payments: [
          {
            id: "pay_rev_replay",
            organizationId: orgId,
            createdById: userId,
            method: "CASH",
            status: "REVERSED",
            amountBaisa: 1000n,
            creditsGranted: 1000n,
            creditsPerBaisa: 1n,
            ledgerEntryId: "led_grant_rep",
            reversalReason: "Reversed already",
            receivedAt: new Date(),
            idempotencyKey: "idem_rec_rep",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        wallets: [
          {
            id: "wal_1",
            organizationId: orgId,
            balanceCache: 1000n,
            version: 3,
          },
        ],
        entries: [
          {
            id: "led_rev_rep",
            walletId: "wal_1",
            type: "REVERSAL",
            amountCredits: 1000n,
            balanceAfter: 1000n,
            idempotencyKey: "idem_rev_replay",
            reversalOfId: "led_grant_rep",
            createdAt: new Date(),
          },
        ],
      });

      const res = await _reversePaymentTx(mock.tx, {
        paymentId: "pay_rev_replay",
        actorUserId: userId,
        reason: "Reversed already",
        idempotencyKey: "idem_rev_replay",
      });

      expect(res.payment.status).toBe("REVERSED");
      expect(res.ledgerEntry.id).toBe("led_rev_rep");
    });

    it("throws PaymentAlreadySettledError when reversing already reversed payment with different idempotency key", async () => {
      const mock = createMockTx({
        payments: [
          {
            id: "pay_rev_settled",
            organizationId: orgId,
            createdById: userId,
            method: "CASH",
            status: "REVERSED",
            amountBaisa: 1000n,
            creditsGranted: 1000n,
            creditsPerBaisa: 1n,
            ledgerEntryId: "led_grant_set",
            reversalReason: "Reversed already",
            receivedAt: new Date(),
            idempotencyKey: "idem_rec_set",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        entries: [
          {
            id: "led_rev_set",
            walletId: "wal_1",
            type: "REVERSAL",
            amountCredits: 1000n,
            balanceAfter: 1000n,
            idempotencyKey: "idem_rev_orig",
            reversalOfId: "led_grant_set",
            createdAt: new Date(),
          },
        ],
      });

      await expect(
        _reversePaymentTx(mock.tx, {
          paymentId: "pay_rev_settled",
          actorUserId: userId,
          reason: "Another reversal attempt",
          idempotencyKey: "idem_rev_different",
        }),
      ).rejects.toThrow(PaymentAlreadySettledError);
    });

    it("replays idempotent reject request with same reason", async () => {
      const mock = createMockTx({
        payments: [
          {
            id: "pay_rej_rep",
            organizationId: orgId,
            createdById: userId,
            method: "CHEQUE",
            status: "REJECTED",
            amountBaisa: 1000n,
            rejectionReason: "Signature mismatch",
            receivedAt: new Date(),
            idempotencyKey: "idem_rec_rej",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      const res = await _rejectPaymentTx(mock.tx, {
        paymentId: "pay_rej_rep",
        actorUserId: userId,
        reason: "Signature mismatch",
        idempotencyKey: "idem_act_rej",
      });

      expect(res.status).toBe("REJECTED");
    });

    it("throws PaymentAlreadySettledError when rejecting with different reason", async () => {
      const mock = createMockTx({
        payments: [
          {
            id: "pay_rej_diff",
            organizationId: orgId,
            createdById: userId,
            method: "CHEQUE",
            status: "REJECTED",
            amountBaisa: 1000n,
            rejectionReason: "Signature mismatch",
            receivedAt: new Date(),
            idempotencyKey: "idem_rec_rej2",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      await expect(
        _rejectPaymentTx(mock.tx, {
          paymentId: "pay_rej_diff",
          actorUserId: userId,
          reason: "Bounced cheque leaf",
          idempotencyKey: "idem_act_rej2",
        }),
      ).rejects.toThrow(PaymentAlreadySettledError);
    });

    it("throws PaymentNotFoundError when rejecting missing payment", async () => {
      const mock = createMockTx();
      await expect(
        _rejectPaymentTx(mock.tx, {
          paymentId: "missing_reject",
          actorUserId: userId,
          reason: "Missing",
          idempotencyKey: "idem_none",
        }),
      ).rejects.toThrow(PaymentNotFoundError);
    });

    it("throws PaymentNotFoundError when reversing missing payment", async () => {
      const mock = createMockTx();
      await expect(
        _reversePaymentTx(mock.tx, {
          paymentId: "missing_reverse",
          actorUserId: userId,
          reason: "Missing",
          idempotencyKey: "idem_none",
        }),
      ).rejects.toThrow(PaymentNotFoundError);
    });
  });

  describe("ledger invariants", () => {
    it("maintains balanceAfter == wallet.balanceCache across a full lifecycle (grant -> admin grant -> reverse)", async () => {
      const mock = createMockTx({
        wallets: [
          {
            id: "wal_1",
            organizationId: orgId,
            balanceCache: 0n,
            version: 0,
          },
        ],
      });

      // 1. Record CASH
      const p1 = await _recordPaymentTx(mock.tx, {
        organizationId: orgId,
        createdById: userId,
        method: "CASH",
        amountBaisa: 10_000n,
        receivedAt: new Date(),
        idempotencyKey: "idem_flow_rec",
      });

      // 2. Confirm payment (rate 1)
      const conf = await _confirmPaymentTx(mock.tx, {
        paymentId: p1.id,
        confirmedById: userId,
        creditsPerBaisa: 1n,
        idempotencyKey: "idem_flow_conf",
      });

      expect(conf.ledgerEntry.balanceAfter).toBe(10_000n);
      expect(mock.getWallet("wal_1")?.balanceCache).toBe(10_000n);

      // 3. Admin grant 5,000 credits
      const grant = await _grantAdminCreditsTx(mock.tx, {
        organizationId: orgId,
        actorUserId: userId,
        amountCredits: 5_000n,
        reason: "Customer satisfaction compensation",
        idempotencyKey: "idem_flow_grant",
      });

      expect(grant.balanceAfter).toBe(15_000n);
      expect(mock.getWallet("wal_1")?.balanceCache).toBe(15_000n);

      // 4. Reverse original payment (deducts 10,000 credits)
      const rev = await _reversePaymentTx(mock.tx, {
        paymentId: p1.id,
        actorUserId: userId,
        reason: "Bank transaction recall",
        idempotencyKey: "idem_flow_rev",
      });

      expect(rev.ledgerEntry.balanceAfter).toBe(5_000n);
      expect(mock.getWallet("wal_1")?.balanceCache).toBe(5_000n);
    });
  });
});
