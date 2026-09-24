import { formatCredits } from "./format-baisa";

export interface LedgerRowPresentation {
  balanceMovementText: string;
  balanceMovementTone: "success" | "destructive" | "neutral" | "muted";
  settlementText: string;
  settlementTone: "neutral" | "muted";
  isSettlement: boolean;
}

export function getLedgerRowPresentation(row: {
  type: string;
  amountCredits: bigint;
  metadata?: unknown;
}): LedgerRowPresentation {
  switch (row.type) {
    case "PAYMENT_GRANT":
    case "ADMIN_GRANT":
      return {
        balanceMovementText: `+${formatCredits(row.amountCredits)}`,
        balanceMovementTone: "success",
        settlementText: "—",
        settlementTone: "muted",
        isSettlement: false,
      };
    case "RESERVATION":
      return {
        balanceMovementText: `−${formatCredits(row.amountCredits)}`,
        balanceMovementTone: "neutral",
        settlementText: "—",
        settlementTone: "muted",
        isSettlement: false,
      };
    case "CAPTURE": {
      let reservedCredits = row.amountCredits;
      if (
        row.metadata &&
        typeof row.metadata === "object" &&
        "reservedCredits" in row.metadata
      ) {
        try {
          reservedCredits = BigInt(
            String((row.metadata as Record<string, unknown>).reservedCredits),
          );
        } catch {
          reservedCredits = row.amountCredits;
        }
      }
      const adjustment = reservedCredits - row.amountCredits;
      let moveText = "0";
      let moveTone: "success" | "destructive" | "muted" = "muted";
      if (adjustment > 0n) {
        moveText = `+${formatCredits(adjustment)}`;
        moveTone = "success";
      } else if (adjustment < 0n) {
        moveText = `−${formatCredits(-adjustment)}`;
        moveTone = "destructive";
      }

      return {
        balanceMovementText: moveText,
        balanceMovementTone: moveTone,
        settlementText: formatCredits(row.amountCredits),
        settlementTone: "neutral",
        isSettlement: true,
      };
    }
    case "RELEASE":
    case "REFUND":
      return {
        balanceMovementText: `+${formatCredits(row.amountCredits)}`,
        balanceMovementTone: "success",
        settlementText: "—",
        settlementTone: "muted",
        isSettlement: false,
      };
    case "REVERSAL":
      return {
        balanceMovementText: `−${formatCredits(row.amountCredits)}`,
        balanceMovementTone: "destructive",
        settlementText: "—",
        settlementTone: "muted",
        isSettlement: false,
      };
    case "ADJUSTMENT":
    default:
      return {
        balanceMovementText: formatCredits(row.amountCredits),
        balanceMovementTone: "neutral",
        settlementText: "—",
        settlementTone: "muted",
        isSettlement: false,
      };
  }
}
