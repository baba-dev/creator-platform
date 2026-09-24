import { describe, expect, it } from "vitest";

import { getLedgerRowPresentation } from "./wallet-ledger";

describe("getLedgerRowPresentation", () => {
  it("presents payment and admin grants as positive balance movements", () => {
    const grant = getLedgerRowPresentation({
      type: "PAYMENT_GRANT",
      amountCredits: 10_000n,
    });
    expect(grant.balanceMovementText).toBe("+10,000");
    expect(grant.balanceMovementTone).toBe("success");
    expect(grant.settlementText).toBe("—");
    expect(grant.isSettlement).toBe(false);

    const adminGrant = getLedgerRowPresentation({
      type: "ADMIN_GRANT",
      amountCredits: 500n,
    });
    expect(adminGrant.balanceMovementText).toBe("+500");
    expect(adminGrant.balanceMovementTone).toBe("success");
    expect(adminGrant.settlementText).toBe("—");
    expect(adminGrant.isSettlement).toBe(false);
  });

  it("presents reservation as a negative balance movement without settlement", () => {
    const reservation = getLedgerRowPresentation({
      type: "RESERVATION",
      amountCredits: 50n,
    });
    expect(reservation.balanceMovementText).toBe("−50");
    expect(reservation.balanceMovementTone).toBe("neutral");
    expect(reservation.settlementText).toBe("—");
    expect(reservation.isSettlement).toBe(false);
  });

  it("separates capture settlement from balance movement when exactly matching reservation", () => {
    const capture = getLedgerRowPresentation({
      type: "CAPTURE",
      amountCredits: 50n,
      metadata: {
        reservedCredits: "50",
      },
    });
    // Does NOT present a negative entry (which would double-charge visually)
    expect(capture.balanceMovementText).toBe("0");
    expect(capture.balanceMovementTone).toBe("muted");
    expect(capture.settlementText).toBe("50");
    expect(capture.isSettlement).toBe(true);
  });

  it("shows positive balance adjustment on capture when actual cost is less than reserved", () => {
    const underCapture = getLedgerRowPresentation({
      type: "CAPTURE",
      amountCredits: 40n,
      metadata: {
        reservedCredits: "50",
      },
    });
    // 10 credits returned to balance
    expect(underCapture.balanceMovementText).toBe("+10");
    expect(underCapture.balanceMovementTone).toBe("success");
    expect(underCapture.settlementText).toBe("40");
    expect(underCapture.isSettlement).toBe(true);
  });

  it("shows negative balance adjustment on capture when actual cost exceeds reserved", () => {
    const overCapture = getLedgerRowPresentation({
      type: "CAPTURE",
      amountCredits: 60n,
      metadata: {
        reservedCredits: "50",
      },
    });
    // 10 additional credits deducted
    expect(overCapture.balanceMovementText).toBe("−10");
    expect(overCapture.balanceMovementTone).toBe("destructive");
    expect(overCapture.settlementText).toBe("60");
    expect(overCapture.isSettlement).toBe(true);
  });

  it("falls back to zero balance movement if capture has no reservation metadata", () => {
    const capture = getLedgerRowPresentation({
      type: "CAPTURE",
      amountCredits: 50n,
    });
    expect(capture.balanceMovementText).toBe("0");
    expect(capture.settlementText).toBe("50");
    expect(capture.isSettlement).toBe(true);
  });

  it("presents releases and refunds as positive balance movements", () => {
    const release = getLedgerRowPresentation({
      type: "RELEASE",
      amountCredits: 50n,
    });
    expect(release.balanceMovementText).toBe("+50");
    expect(release.balanceMovementTone).toBe("success");
    expect(release.settlementText).toBe("—");

    const refund = getLedgerRowPresentation({
      type: "REFUND",
      amountCredits: 50n,
    });
    expect(refund.balanceMovementText).toBe("+50");
    expect(refund.balanceMovementTone).toBe("success");
    expect(refund.settlementText).toBe("—");
  });

  it("presents reversals as negative balance movements", () => {
    const reversal = getLedgerRowPresentation({
      type: "REVERSAL",
      amountCredits: 10_000n,
    });
    expect(reversal.balanceMovementText).toBe("−10,000");
    expect(reversal.balanceMovementTone).toBe("destructive");
    expect(reversal.settlementText).toBe("—");
  });
});
