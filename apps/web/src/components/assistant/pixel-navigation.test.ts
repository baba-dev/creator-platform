import { describe, expect, it } from "vitest";
import { safePixelRoute } from "./pixel-navigation";

describe("Pixel navigation boundary", () => {
  it("opens real workspace pages and stable resource IDs", () => {
    expect(safePixelRoute("/image?assetId=asset-1", "team")).toBe(
      "/app/team/image?assetId=asset-1",
    );
    expect(safePixelRoute("/app/team/history/job-1", "team")).toBe(
      "/app/team/history/job-1",
    );
  });
  it.each([
    "//evil.example",
    "https://evil.example",
    "/app/other/image",
    "/admin",
    "/image/../../admin",
    "/image%2f..%2fadmin",
    "/image\\evil",
    "/api/assets",
    "/studio/image",
    "/app/team/image/extra",
  ])("rejects unsafe or unsupported destination %s", (route) => {
    expect(safePixelRoute(route, "team")).toBeNull();
  });
});
