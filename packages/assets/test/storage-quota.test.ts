import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleDriveAssetStorage } from "../src/byos/google-drive";
import { OneDriveAssetStorage } from "../src/byos/onedrive";
import { byteValue, quotaFromBytes } from "../src/byos/quota";

afterEach(() => vi.unstubAllGlobals());
describe("storage quota", () => {
  it("preserves integer precision and rejects malformed capacity", () => {
    expect(byteValue.parse("9007199254740993")).toBe(9007199254740993n);
    for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "-1", "oops"])
      expect(byteValue.safeParse(value).success).toBe(false);
    expect(quotaFromBytes(undefined, 20n).totalBytes).toBeNull();
    expect(quotaFromBytes(10n, 20n).availableBytes).toBe("0");
  });
  it("reads Google account-wide usage, not just Drive files", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        storageQuota: { limit: "100", usage: "70", usageInDrive: "20" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const storage = new GoogleDriveAssetStorage({
      getAccessToken: async () => "test-token",
      rootFolderId: "folder",
    });
    expect(await storage.getQuota()).toEqual({
      totalBytes: "100",
      usedBytes: "70",
      availableBytes: "30",
    });
    expect(fetcher.mock.calls[0]?.[0]).toContain("fields=storageQuota");
  });
  it("uses Microsoft's reported remaining capacity", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ quota: { total: 100, used: 60, remaining: 30 } }),
        ),
    );
    const storage = new OneDriveAssetStorage({
      getAccessToken: async () => "test-token",
      rootFolderId: "folder",
    });
    expect(await storage.getQuota()).toEqual({
      totalBytes: "100",
      usedBytes: "60",
      availableBytes: "30",
    });
  });
  it("does not present a failed quota request as zero usage", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("private upstream detail", { status: 403 }),
        ),
    );
    const storage = new GoogleDriveAssetStorage({
      getAccessToken: async () => "test-token",
      rootFolderId: "folder",
    });
    await expect(storage.getQuota()).rejects.toThrow(
      "Storage quota is temporarily unavailable.",
    );
  });
});
