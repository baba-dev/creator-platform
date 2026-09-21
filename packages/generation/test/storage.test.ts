import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  downloadImage,
  readStoredImage,
  storagePath,
  storeImage,
} from "../src/storage";

afterEach(() => vi.unstubAllEnvs());
describe("private image storage", () => {
  it.each(["../secret.png", "/etc/passwd", "job.png/../../secret", "job.svg"])(
    "rejects unsafe key %s",
    (key) => expect(() => storagePath(key)).toThrow(),
  );
  it.each([
    "http://cdn.bytepluscdn.com/a.png",
    "https://127.0.0.1/a.png",
    "https://cdn.bytepluscdn.com.evil.example/a.png",
    "https://user:pass@cdn.bytepluscdn.com/a.png",
    "https://cdn.bytepluscdn.com:8443/a.png",
  ])("rejects unsafe output URL %s", async (url) => {
    await expect(downloadImage(url)).rejects.toThrow("Untrusted image host");
  });
  it("writes a durable object and checksum that can be read after success", async () => {
    const root = await mkdtemp(join(tmpdir(), "creator-storage-"));
    vi.stubEnv("ASSET_STORAGE_ROOT", root);
    try {
      const bytes = Buffer.from("image fixture");
      const result = await storeImage("job.png", bytes);
      expect(result.byteSize).toBe(BigInt(bytes.length));
      expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(await readStoredImage("job.png")).toEqual(bytes);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
