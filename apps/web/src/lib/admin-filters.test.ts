import { describe, expect, it } from "vitest";

import { parseAdminListFilters } from "./admin-filters";

describe("parseAdminListFilters", () => {
  it("normalizes valid list filters", () =>
    expect(
      parseAdminListFilters({
        page: "3",
        search: "  acme  ",
        status: "MANUAL_REVIEW",
      }),
    ).toEqual({ page: 3, search: "acme", status: "MANUAL_REVIEW" }));
  it("falls back safely for malformed filters", () =>
    expect(
      parseAdminListFilters({
        page: "-8",
        search: "x".repeat(101),
        status: "failed<script>",
      }),
    ).toEqual({ page: 1, search: "", status: "" }));
  it("uses the first value for repeated parameters", () =>
    expect(
      parseAdminListFilters({ page: ["2", "9"], search: ["one", "two"] }),
    ).toMatchObject({ page: 2, search: "one" }));
});
