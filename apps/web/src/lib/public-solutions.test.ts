import { describe, expect, it } from "vitest";
import { publicToolById } from "./public-tools";
import { recommendSolution, relevantModels, solutionBySlug, solutionHref, solutions } from "./public-solutions";
import { pricingCategories } from "./public-pricing-contract";
describe("public solutions", () => {
  it("has five unique, safe routes and complete editorial content", () => {
    expect(solutions).toHaveLength(5);
    expect(new Set(solutions.map((s) => s.slug)).size).toBe(5);
    for (const s of solutions) {
      expect(s.slug).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
      expect(s.description.length).toBeGreaterThan(80);
      expect(s.benefits.length).toBeGreaterThanOrEqual(3);
      expect(s.workflow.length).toBeGreaterThanOrEqual(4);
      expect(s.questions.length).toBeGreaterThanOrEqual(3);
      expect(solutionBySlug(s.slug)).toBe(s);
      expect(solutionHref(s)).toBe("/solutions/" + s.slug);
      for (const step of s.workflow) expect(publicToolById(step.toolId)).toBeDefined();
      for (const category of s.modelCategories) expect(pricingCategories.some((p) => p.id === category)).toBe(true);
      for (const slug of s.related) expect(solutionBySlug(slug)).toBeDefined();
    }
    expect(solutionBySlug("../admin")).toBeUndefined();
  });
  it("provides deterministic recommendations from real tool IDs", () => {
    const result = recommendSolution("ecommerce", "product", "cost");
    expect(result?.solution.slug).toBe("ecommerce");
    expect(result?.tools[0]?.id).toBe("image-studio");
    expect(result?.tools.every((tool) => Boolean(publicToolById(tool.id)))).toBe(true);
    expect(result?.advice).toMatch(/quote/);
    expect(recommendSolution("not-real" as "ecommerce", "social", "speed")).toBeNull();
  });
  it("filters the public-safe catalogue by category without altering prices", () => {
    const rows = [
      { id: "a", category: "image", baseCredits: "123" },
      { id: "b", category: "chat", baseCredits: "456" },
    ] as Parameters<typeof relevantModels>[0];
    expect(relevantModels(rows, ["image"]).map((row) => row.id)).toEqual(["a"]);
    expect(relevantModels(rows, ["image"])[0]?.baseCredits).toBe("123");
  });
});
