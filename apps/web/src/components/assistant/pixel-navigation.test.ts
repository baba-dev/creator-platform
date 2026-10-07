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
    expect(safePixelRoute("/image/precision?assetId=asset-1", "team")).toBe(
      "/app/team/image/precision?assetId=asset-1",
    );
    expect(safePixelRoute("/video/editor", "team")).toBe(
      "/app/team/video/editor",
    );
    expect(safePixelRoute("/speech/transcription", "team")).toBe(
      "/app/team/speech/transcription",
    );
    expect(safePixelRoute("/speech/voices", "team")).toBe(
      "/app/team/speech/voices",
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
    "/app/team/image/precision/extra",
    "/app/team/speech/voices/extra",
  ])("rejects unsafe or unsupported destination %s", (route) => {
    expect(safePixelRoute(route, "team")).toBeNull();
  });
});
