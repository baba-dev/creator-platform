import { describe, expect, it } from "vitest";

import {
  confirmPaymentSchema,
  grantAdminCreditsSchema,
  ledgerExportQuerySchema,
  paymentExportQuerySchema,
  paymentListQuerySchema,
  recordPaymentSchema,
} from "../src/index";

const idempotencyKey = "payment-test-key-0001";

describe("payment validation", () => {
  it("accepts a positive payment amount supplied as JSON text", () => {
    const result = recordPaymentSchema.safeParse({
      method: "CASH",
      amountBaisa: "1000",
      receivedAt: "2026-09-19T08:00:00.000Z",
      idempotencyKey,
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.amountBaisa).toBe(1000n);
  });

  it("rejects zero and out-of-range payment amounts", () => {
    const base = {
      method: "CASH",
      receivedAt: "2026-09-19T08:00:00.000Z",
      idempotencyKey,
    };

    expect(
      recordPaymentSchema.safeParse({ ...base, amountBaisa: "0" }).success,
    ).toBe(false);
    expect(
      recordPaymentSchema.safeParse({
        ...base,
        amountBaisa: "9223372036854775808",
      }).success,
    ).toBe(false);
  });

  it("requires bank details for cheque payments", () => {
    const base = {
      method: "CHEQUE",
      amountBaisa: "1000",
      receivedAt: "2026-09-19T08:00:00.000Z",
      idempotencyKey,
    };

    expect(recordPaymentSchema.safeParse(base).success).toBe(false);
    expect(
      recordPaymentSchema.safeParse({
        ...base,
        chequeNumber: "004921",
        bankName: "Bank Muscat",
      }).success,
    ).toBe(true);
  });

  it("rejects zero confirmation rates and zero admin grants", () => {
    expect(
      confirmPaymentSchema.safeParse({
        creditsPerBaisa: "0",
        idempotencyKey,
      }).success,
    ).toBe(false);
    expect(
      grantAdminCreditsSchema.safeParse({
        amountCredits: "0",
        reason: "Invalid zero grant",
        idempotencyKey,
      }).success,
    ).toBe(false);
  });

  it("validates payment list and export enums", () => {
    expect(
      paymentListQuerySchema.safeParse({ status: "UNKNOWN" }).success,
    ).toBe(false);
    expect(
      paymentExportQuerySchema.safeParse({ method: "CARD" }).success,
    ).toBe(false);
    expect(
      ledgerExportQuerySchema.safeParse({ type: "UNKNOWN" }).success,
    ).toBe(false);
  });

  it("rejects inverted export date ranges", () => {
    expect(
      paymentExportQuerySchema.safeParse({
        from: "2026-09-20T00:00:00.000Z",
        to: "2026-09-19T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});
