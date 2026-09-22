import { describe, expect, it } from "vitest";

import {
  publishPriceVersionSchema,
  quoteRequestSchema,
  toggleModelEnabledSchema,
} from "../src/index";

describe("model validation schemas", () => {
  it("validates toggleModelEnabledSchema", () => {
    expect(toggleModelEnabledSchema.safeParse({ enabled: true }).success).toBe(
      true,
    );
    expect(toggleModelEnabledSchema.safeParse({ enabled: false }).success).toBe(
      true,
    );
    expect(
      toggleModelEnabledSchema.safeParse({ enabled: "true" }).success,
    ).toBe(false);
    expect(toggleModelEnabledSchema.safeParse({}).success).toBe(false);
  });

  it("validates publishPriceVersionSchema with numbers and string bigints", () => {
    const valid = publishPriceVersionSchema.safeParse({
      providerCostMicroUsd: "54000",
      targetMarginBps: 2500,
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.providerCostMicroUsd).toBe(54_000n);
      expect(valid.data.targetMarginBps).toBe(2500);
      expect(valid.data.pricingDimension).toBeUndefined();
      expect(valid.data.unitQuantity).toBeUndefined();
    }

    const characterPrice = publishPriceVersionSchema.safeParse({
      providerCostMicroUsd: "30000",
      targetMarginBps: 2500,
      pricingDimension: "CHARACTER",
      unitQuantity: 1000,
    });
    expect(characterPrice.success).toBe(true);

    const withDefaults = publishPriceVersionSchema.safeParse({
      providerCostMicroUsd: "10000",
      targetMarginBps: 0,
      fxBaisaNumerator: "769",
      fxBaisaDenominator: "2",
      creditsPerBaisa: "1",
    });
    expect(withDefaults.success).toBe(true);

    const invalidMargin = publishPriceVersionSchema.safeParse({
      providerCostMicroUsd: "54000",
      targetMarginBps: 10000,
    });
    expect(invalidMargin.success).toBe(false);

    const negativeMargin = publishPriceVersionSchema.safeParse({
      providerCostMicroUsd: "54000",
      targetMarginBps: -1,
    });
    expect(negativeMargin.success).toBe(false);
  });

  it("validates quoteRequestSchema", () => {
    const valid = quoteRequestSchema.safeParse({
      organizationId: "c12345678901234567890",
      modelId: "seedream-5-lite",
      units: 2,
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.units).toBe(2);
    }

    // Default units is 1
    const defaultUnits = quoteRequestSchema.safeParse({
      organizationId: "c12345678901234567890",
      modelId: "seedance-2-5",
    });
    expect(defaultUnits.success).toBe(true);
    if (defaultUnits.success) {
      expect(defaultUnits.data.units).toBe(1);
    }

    // Rejects non-positive units
    expect(
      quoteRequestSchema.safeParse({
        organizationId: "c12345678901234567890",
        modelId: "seedream-5-lite",
        units: 0,
      }).success,
    ).toBe(false);

    // Rejects invalid organizationId
    expect(
      quoteRequestSchema.safeParse({
        organizationId: "short",
        modelId: "seedream-5-lite",
      }).success,
    ).toBe(false);
  });
});
