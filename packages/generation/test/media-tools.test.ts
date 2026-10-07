import { describe, expect, it } from "vitest";
import {
  providerToolActualQuantity,
  providerToolRequestHash,
} from "../src/media-tools";

describe("MediaKit durable execution helpers", () => {
  it("canonicalizes request payloads before hashing idempotent work", () => {
    const a = providerToolRequestHash({
      toolId: "tool",
      priceVersionId: "price",
      quotedQuantity: 3,
      payload: { z: 1, nested: { b: true, a: "x" } },
    });
    const b = providerToolRequestHash({
      toolId: "tool",
      priceVersionId: "price",
      quotedQuantity: 3,
      payload: { nested: { a: "x", b: true }, z: 1 },
    });
    expect(a).toBe(b);
  });

  it("binds source-asset snapshots into the idempotent request hash", () => {
    const a = providerToolRequestHash({
      toolId: "tool",
      priceVersionId: "price",
      quotedQuantity: 5,
      payload: {},
      sourceAssets: [{ assetId: "asset-a", role: "SOURCE_VIDEO", position: 0 }],
    });
    const b = providerToolRequestHash({
      toolId: "tool",
      priceVersionId: "price",
      quotedQuantity: 5,
      payload: {},
      sourceAssets: [{ assetId: "asset-b", role: "SOURCE_VIDEO", position: 0 }],
    });
    expect(a).not.toBe(b);
  });

  it("ceil-rounds authoritative provider seconds and never guesses missing usage", () => {
    expect(
      providerToolActualQuantity("OUTPUT_SECOND", { duration: 2.01 }),
    ).toBe(3);
    expect(
      providerToolActualQuantity("INPUT_SECOND", { duration: "4.2" }),
    ).toBe(5);
    expect(providerToolActualQuantity("OUTPUT_SECOND", {})).toBeNull();
    expect(providerToolActualQuantity("REQUEST", undefined)).toBe(1);
  });
});
