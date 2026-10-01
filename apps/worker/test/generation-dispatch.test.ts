import { describe, expect, it } from "vitest";
import {
  applyTenantFairness,
  interleaveGenerationWork,
} from "../src/generation-dispatch";

describe("applyTenantFairness", () => {
  it("returns empty or single-item inputs without loss", () => {
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
    expect(result.map((job) => job.id)).toEqual([
      "a1",
      "b1",
      "c1",
      "a2",
      "c2",
      "a3",
    ]);
  });

  it("never drops a busy tenant's scanned jobs", () => {
    const jobs = Array.from({ length: 100 }, (_, index) => ({
      id: `a${index + 1}`,
      organizationId: "org-a",
    }));

    const result = applyTenantFairness(jobs);
    expect(result).toHaveLength(100);
    expect(result.map((job) => job.id)).toEqual(jobs.map((job) => job.id));
  });

  it("preserves every input exactly once across imbalanced tenants", () => {
    const jobs = [
      ...Array.from({ length: 20 }, (_, index) => ({
        id: `a${index + 1}`,
        organizationId: "org-a",
      })),
      { id: "b1", organizationId: "org-b" },
      { id: "c1", organizationId: "org-c" },
      { id: "c2", organizationId: "org-c" },
    ];

    const result = applyTenantFairness(jobs);
    expect(result).toHaveLength(jobs.length);
    expect(new Set(result.map((job) => job.id))).toEqual(
      new Set(jobs.map((job) => job.id)),
    );
  });
});

describe("interleaveGenerationWork", () => {
  it("alternates submissions and polls while preserving class order", () => {
    expect(interleaveGenerationWork(["q1", "q2", "q3"], ["p1", "p2"])).toEqual([
      "q1",
      "p1",
      "q2",
      "p2",
      "q3",
    ]);
  });

  it("preserves all work when one class is empty", () => {
    expect(interleaveGenerationWork(["q1", "q2"], [])).toEqual(["q1", "q2"]);
    expect(interleaveGenerationWork([], ["p1", "p2"])).toEqual(["p1", "p2"]);
  });
});
