import { describe, expect, it } from "vitest";
import { applyTenantFairness } from "../src/generation-dispatch";

describe("applyTenantFairness", () => {
  it("returns original array if empty or single item", () => {
    expect(applyTenantFairness([])).toEqual([]);
    const single = [{ id: "1", organizationId: "org-a" }];
    expect(applyTenantFairness(single)).toEqual(single);
  });

  it("round-robins across different tenants", () => {
    const jobs = [
      { id: "a1", organizationId: "org-a" },
      { id: "a2", organizationId: "org-a" },
      { id: "a3", organizationId: "org-a" },
      { id: "b1", organizationId: "org-b" },
      { id: "c1", organizationId: "org-c" },
      { id: "c2", organizationId: "org-c" },
    ];

    const result = applyTenantFairness(jobs);
    expect(result.map((j) => j.id)).toEqual([
      "a1",
      "b1",
      "c1",
      "a2",
      "c2",
      "a3",
    ]);
  });

  it("enforces maxPerTenant limit per batch", () => {
    const jobs = [
      { id: "a1", organizationId: "org-a" },
      { id: "a2", organizationId: "org-a" },
      { id: "a3", organizationId: "org-a" },
      { id: "a4", organizationId: "org-a" },
      { id: "b1", organizationId: "org-b" },
    ];

    const result = applyTenantFairness(jobs, 2);
    expect(result.map((j) => j.id)).toEqual(["a1", "b1", "a2"]);
  });
});
