import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  downloadImage,
  downloadVideo,
  isTrustedImageHostname,
  readStoredAsset,
  readStoredAssetRange,
  readStoredImage,
  storagePath,
  storeAudio,
  storeImage,
  storeVideo,
  storedAssetSize,
  validateMp3Bytes,
} from "../src/storage";

afterEach(() => vi.unstubAllEnvs());
describe("private image storage", () => {
  it("accepts only explicit BytePlus image storage service domains", () => {
    expect(
      isTrustedImageHostname(
        "ark-acg-ap-southeast-1.tos-ap-southeast-1.volces.com",
      ),
    ).toBe(true);
    expect(
      isTrustedImageHostname(
        "ark-content-generation-v2-ap-southeast-1.tos-ap-southeast-1.volces.com",
      ),
    ).toBe(true);
    expect(isTrustedImageHostname("tos-ap-southeast-1.volces.com")).toBe(false);
    expect(isTrustedImageHostname("cdn.bytepluscdn.com")).toBe(true);
    expect(isTrustedImageHostname("volces.com")).toBe(false);
    expect(
      isTrustedImageHostname("tos-ap-southeast-1.volces.com.evil.example"),
    ).toBe(false);
  });

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
    await expect(downloadImage(url)).rejects.toThrow("untrusted image host");
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

  it.each([
    "http://cdn.bytepluscdn.com/a.mp4",
    "https://127.0.0.1/a.mp4",
    "https://cdn.bytepluscdn.com.evil.example/a.mp4",
  ])("rejects unsafe video output URL %s", async (url) => {
    await expect(downloadVideo(url)).rejects.toThrow("untrusted video host");
  });

  it("writes and reads a private MP4 object", async () => {
    const root = await mkdtemp(join(tmpdir(), "creator-video-storage-"));
    vi.stubEnv("ASSET_STORAGE_ROOT", root);
    try {
      const bytes = Buffer.from("video fixture");
      const result = await storeVideo("job.mp4", bytes);
      expect(result.byteSize).toBe(BigInt(bytes.length));
      expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(await readStoredAsset("job.mp4")).toEqual(bytes);
      expect(await storedAssetSize("job.mp4")).toBe(bytes.length);
      expect(await readStoredAssetRange("job.mp4", 2, 6)).toEqual(
        bytes.subarray(2, 7),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 15000);

  it("validates valid MP3 frames", () => {
    // MPEG-1 Layer III, 128 kbps, 44.1 kHz: 417 bytes per frame.
    const frame = Buffer.concat([
      Buffer.from([0xff, 0xfb, 0x90, 0x64]),
      Buffer.alloc(413),
    ]);
    const validRaw = Buffer.concat([frame, frame]);
    expect(() => validateMp3Bytes(validRaw)).not.toThrow();

    // ID3v2 tag followed by MPEG sync
    const id3Header = Buffer.from([
      0x49,
      0x44,
      0x33, // "ID3"
      0x03,
      0x00, // version 2.3.0
      0x00, // flags
      0x00,
      0x00,
      0x00,
      0x04, // synchsafe size = 4 bytes
    ]);
    const id3Body = Buffer.alloc(4);
    const validWithId3 = Buffer.concat([id3Header, id3Body, frame, frame]);
    expect(() => validateMp3Bytes(validWithId3)).not.toThrow();
  });

  it("rejects empty or corrupt MP3 bytes", () => {
    expect(() => validateMp3Bytes(Buffer.alloc(0))).toThrow("empty");
    expect(() => validateMp3Bytes(Buffer.from("invalid-audio-data"))).toThrow(
      "MP3 validation",
    );
    expect(() => validateMp3Bytes(Buffer.from([0x00, 0x01, 0x02]))).toThrow(
      "MP3 validation",
    );
  });

  it("writes and reads a private MP3 audio object", async () => {
    const root = await mkdtemp(join(tmpdir(), "creator-audio-storage-"));
    vi.stubEnv("ASSET_STORAGE_ROOT", root);
    try {
      const frame = Buffer.concat([
        Buffer.from([0xff, 0xfb, 0x90, 0x64]),
        Buffer.alloc(413),
      ]);
      const validMp3 = Buffer.concat([frame, frame]);
      const result = await storeAudio("job.mp3", validMp3);
      expect(result.byteSize).toBe(BigInt(validMp3.length));
      expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(await readStoredAsset("job.mp3")).toEqual(validMp3);
      expect(await storedAssetSize("job.mp3")).toBe(validMp3.length);
      expect(await readStoredAssetRange("job.mp3", 0, 3)).toEqual(
        validMp3.subarray(0, 4),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
