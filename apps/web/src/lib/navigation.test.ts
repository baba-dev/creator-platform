import { describe, expect, it } from "vitest";

import { safeInternalRoute } from "./navigation";

describe("safeInternalRoute", () => {
  it("keeps internal paths and query strings", () => {
    expect(safeInternalRoute("/app/client?tab=usage")).toBe(
      "/app/client?tab=usage",
    );
  });

  it.each([
    "https://attacker.example",
    "//attacker.example/path",
    "/\\attacker.example/path",
  ])("rejects external return target %s", (target) => {
    expect(safeInternalRoute(target)).toBe("/app");
  });
});
