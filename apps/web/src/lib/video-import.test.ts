import { describe, expect, it, vi } from "vitest";
import { approvedVideoUrl, downloadApprovedVideo } from "./video-import";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("video link import", () => {
  it("admits only exact HTTPS delivery hosts and refuses redirects", async () => {
    expect(
      approvedVideoUrl("https://cdn.example.com/clip.mp4", "cdn.example.com")
        .hostname,
    ).toBe("cdn.example.com");
    for (const url of [
      "http://cdn.example.com/clip.mp4",
      "https://cdn.example.com.evil.test/clip",
      "https://127.0.0.1/clip",
      "https://cdn.example.com:8443/clip",
    ]) {
      expect(() => approvedVideoUrl(url, "cdn.example.com")).toThrow();
    }
    const root = await mkdtemp(join(tmpdir(), "video-link-test-"));
    try {
      const fetcher = vi.fn(
        async () =>
          new Response(null, {
            status: 302,
            headers: { Location: "https://cdn.example.com/other" },
          }),
      );
      await expect(
        downloadApprovedVideo(
          new URL("https://cdn.example.com/clip"),
          join(root, "media"),
          fetcher as typeof fetch,
        ),
      ).rejects.toThrow();
      expect(fetcher.mock.calls).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
