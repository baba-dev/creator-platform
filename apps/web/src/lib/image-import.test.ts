import { describe, expect, it, vi } from "vitest";
import { approvedImageUrl, fetchApprovedImage } from "./image-import";

describe("controlled image import", () => {
  it("requires an exact HTTPS host without credentials, port or IP literal", () => {
    const hosts = "images.example.com,cdn.example.com";
    expect(
      approvedImageUrl("https://images.example.com/a.png", hosts).hostname,
    ).toBe("images.example.com");
    for (const url of [
      "http://images.example.com/a",
      "https://images.example.com.evil.test/a",
      "https://127.0.0.1/a",
      "https://user:pass@images.example.com/a",
      "https://images.example.com:444/a",
    ]) {
      expect(() => approvedImageUrl(url, hosts)).toThrow();
    }
  });

  it("rejects redirects and oversized streams", async () => {
    const url = new URL("https://images.example.com/image.png");
    const redirected = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "http://localhost/" },
        }),
    ) as unknown as typeof fetch;
    await expect(fetchApprovedImage(url, redirected)).rejects.toThrow();
    const oversized = vi.fn(
      async () =>
        new Response(new Uint8Array(20_000_001), {
          headers: { "content-type": "image/png" },
        }),
    ) as unknown as typeof fetch;
    await expect(fetchApprovedImage(url, oversized)).rejects.toThrow(/20 MB/);
  });
});
