import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyAssetMediaKind,
  defaultAssetName,
  normalizeAssetName,
  normalizeOriginalFilename,
} from "../src/index";
import {
  createAssetObjectKey,
  LocalAssetStorage,
  resolveLocalAssetPath,
} from "../src/storage";

describe("asset metadata primitives", () => {
  it("classifies verified MIME types into stable product media kinds", () => {
    expect(classifyAssetMediaKind("image/png")).toBe("IMAGE");
    expect(classifyAssetMediaKind("video/mp4")).toBe("VIDEO");
    expect(classifyAssetMediaKind("audio/mpeg")).toBe("AUDIO");
    expect(classifyAssetMediaKind("application/pdf")).toBe("DOCUMENT");
    expect(classifyAssetMediaKind("application/octet-stream")).toBe("OTHER");
  });

  it("keeps display names and filenames separate from storage paths", () => {
    expect(normalizeAssetName("  Campaign\n   Hero  ")).toBe("Campaign Hero");
    expect(normalizeOriginalFilename("../../unsafe/hero image.png")).toBe(
      "hero image.png",
    );
    expect(defaultAssetName("IMAGE", "GENERATED")).toBe("Generated image");
  });
});

describe("local asset storage", () => {
  it("creates opaque organization-scoped object keys", () => {
    const key = createAssetObjectKey("org_123", "PNG");
    expect(key).toMatch(
      /^org\/org_123\/assets\/[a-f0-9]{2}\/[a-f0-9]{32}\.png$/,
    );
    expect(() => createAssetObjectKey("../other", "png")).toThrow();
  });

  it.each([
    "../secret.png",
    "/etc/passwd",
    "org/a/assets/../secret.png",
    "org//asset.png",
  ])("rejects unsafe local key %s", (key) => {
    expect(() => resolveLocalAssetPath("/tmp/assets", key)).toThrow();
  });

  it("writes atomically and supports reads, ranges, stats and delete", async () => {
    const root = await mkdtemp(join(tmpdir(), "aiwa-assets-"));
    const storage = new LocalAssetStorage(root);
    const key = "org/org_1/assets/aa/asset.bin";
    try {
      const bytes = Buffer.from("0123456789");
      const stored = await storage.put(key, bytes);
      expect(stored.byteSize).toBe(10n);
      expect(stored.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(await storage.read(key)).toEqual(bytes);
      expect(await storage.readRange(key, 2, 5)).toEqual(Buffer.from("2345"));
      expect((await storage.stat(key)).byteSize).toBe(10n);
      await storage.delete(key);
      await expect(storage.read(key)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
