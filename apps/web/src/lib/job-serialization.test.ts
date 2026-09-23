import { describe, expect, it } from "vitest";
import { serializeJobDetails } from "./job-serialization";

describe("serializeJobDetails", () => {
  it("serializes BigInt values across job, wallet, priceVersion, assets and ledger entries", () => {
    const mockData = {
      job: {
        id: "job-xyz",
        reservedCredits: 28n,
        chargedCredits: 0n,
        actualProviderCostMicroUsd: 15000n,
        organization: {
          id: "org-1",
          name: "Acme",
          slug: "acme",
          status: "ACTIVE",
          wallet: {
            id: "wallet-1",
            balanceCache: 1000n,
          },
        },
        project: null,
        createdBy: { id: "user-1", name: "Alice", email: "alice@example.com" },
        providerModel: {
          id: "model-1",
          displayName: "Seedream 5.0 Lite",
          providerModelId: "seedream-5-0-260128",
          provider: "BYTEPLUS",
          mediaKind: "IMAGE",
        },
        priceVersion: {
          id: "pv-1",
          providerCostMicroUsd: 15000n,
          customerCredits: 28n,
          creditsPerBaisa: 1n,
          targetMarginBps: 2000,
          pricingDimension: "REQUEST",
          unitQuantity: 1,
        },
        assets: [
          {
            id: "ast-1",
            objectKey: "job-xyz.png",
            status: "PENDING",
            mimeType: "image/png",
            byteSize: 26214400n,
            sha256: null,
            width: null,
            height: null,
            durationMs: null,
            createdAt: new Date(),
          },
        ],
      },
      ledgerEntries: [
        {
          id: "led-1",
          type: "RESERVATION",
          amountCredits: 28n,
          balanceAfter: 972n,
          reversalOf: null,
          reversedBy: {
            id: "led-2",
            type: "RELEASE",
            amountCredits: 28n,
          },
        },
      ],
      auditEvents: [{ id: "aud-1", action: "generation.queued" }],
      permittedActions: {
        canReconcile: true,
        canRecover: true,
        canRelease: true,
        canRefund: false,
      },
    };

    const serialized = serializeJobDetails(
      mockData as unknown as Parameters<typeof serializeJobDetails>[0],
    );

    if (!serialized) {
      throw new Error("Expected serialized to not be null");
    }

    expect(serialized.job.reservedCredits).toBe("28");
    expect(serialized.job.chargedCredits).toBe("0");
    expect(serialized.job.actualProviderCostMicroUsd).toBe("15000");
    expect(serialized.job.organization.wallet?.balanceCache).toBe("1000");
    expect(serialized.job.priceVersion?.providerCostMicroUsd).toBe("15000");
    expect(serialized.job.priceVersion?.customerCredits).toBe("28");
    expect(serialized.job.priceVersion?.creditsPerBaisa).toBe("1");
    expect(serialized.job.assets[0]?.byteSize).toBe("26214400");
    expect(serialized.ledgerEntries[0]?.amountCredits).toBe("28");
    expect(serialized.ledgerEntries[0]?.balanceAfter).toBe("972");
    expect(serialized.ledgerEntries[0]?.reversedBy?.amountCredits).toBe("28");
    expect(serialized.permittedActions.canRelease).toBe(true);
  });

  it("handles null and missing fields gracefully", () => {
    expect(serializeJobDetails(null)).toBeNull();

    const minimal = {
      job: {
        id: "job-min",
        reservedCredits: 0n,
        chargedCredits: 0n,
        actualProviderCostMicroUsd: null,
        organization: { id: "org-min", wallet: null },
        project: null,
        createdBy: { id: "user-min", name: "Bob", email: "bob@example.com" },
        providerModel: null,
        priceVersion: null,
        assets: [],
      },
      ledgerEntries: [],
      auditEvents: [],
      permittedActions: {
        canReconcile: true,
        canRecover: false,
        canRelease: false,
        canRefund: false,
      },
    };

    const serialized = serializeJobDetails(
      minimal as unknown as Parameters<typeof serializeJobDetails>[0],
    );
    if (!serialized) {
      throw new Error("Expected serialized to not be null");
    }
    expect(serialized.job.actualProviderCostMicroUsd).toBeNull();
    expect(serialized.job.organization.wallet).toBeNull();
    expect(serialized.job.priceVersion).toBeNull();
  });
});
