import { describe, expect, it } from "vitest";

import { spokespersonToolRequestSchema } from "./schema";

const common = {
  organizationId: "org-1",
  assetId: "asset-1",
  idempotencyKey: "a95d35bb-7db0-4e1e-a273-c03a18c3146b",
};

describe("spokesperson MediaKit request validation", () => {
  it("defaults portrait matting to a transparent WebM", () => {
    expect(
      spokespersonToolRequestSchema.parse({ ...common, tool: "matting" }),
    ).toMatchObject({ tool: "matting", mattingFormat: "WEBM" });
  });

  it("accepts a supported solid background only for MP4 matting", () => {
    expect(
      spokespersonToolRequestSchema.safeParse({
        ...common,
        tool: "matting",
        mattingFormat: "MP4",
        backgroundColor: "green",
      }).success,
    ).toBe(true);
    expect(
      spokespersonToolRequestSchema.safeParse({
        ...common,
        tool: "matting",
        mattingFormat: "WEBM",
        backgroundColor: "green",
      }).success,
    ).toBe(false);
  });

  it.each(["quality", "smoothness"] as const)(
    "rejects matting-only fields for %s requests",
    (tool) => {
      expect(
        spokespersonToolRequestSchema.safeParse({
          ...common,
          tool,
          mattingFormat: "MP4",
        }).success,
      ).toBe(false);
    },
  );
});
