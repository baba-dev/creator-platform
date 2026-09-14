import { describe, expect, it } from "vitest";

import {
  createOrganizationSlug,
  normalizeOrganizationSlug,
} from "./organizations";

describe("organization slugs", () => {
  it("normalizes a display name and adds a collision-resistant suffix", () => {
    expect(createOrganizationSlug("Aiwa Client Network", "A1B2C3D4")).toBe(
      "aiwa-client-network-a1b2c3d4",
    );
  });

  it("uses a safe fallback for names without Latin characters", () => {
    expect(normalizeOrganizationSlug("عمان")).toBe("workspace");
  });

  it("keeps the readable prefix bounded", () => {
    expect(normalizeOrganizationSlug("a".repeat(100))).toHaveLength(48);
  });
});
