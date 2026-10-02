import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  ensureGoogleDriveCreatorsFolder,
  getGoogleDriveAuthUrl,
  GoogleDriveAssetStorage,
} from "../src/byos/google-drive";
import {
  ensureOneDriveCreatorsFolder,
  getOneDriveAuthUrl,
  OneDriveAssetStorage,
} from "../src/byos/onedrive";

describe("BYOS Google Drive", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("builds correct Google Drive OAuth URL with offline access", () => {
    const url = getGoogleDriveAuthUrl({
      clientId: "test-client-id",
      redirectUri: "https://app.com/callback",
      state: "csrf-state-123",
    });
    const parsed = new URL(url);
    expect(parsed.hostname).toBe("accounts.google.com");
    expect(parsed.searchParams.get("client_id")).toBe("test-client-id");
    expect(parsed.searchParams.get("access_type")).toBe("offline");
    expect(parsed.searchParams.get("prompt")).toBe("consent");
    expect(parsed.searchParams.get("scope")).toContain("drive.file");
  });

  it("discovers existing Creators-Data folder", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        files: [{ id: "existing-folder-id", name: "Creators-Data" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const folderId = await ensureGoogleDriveCreatorsFolder("fake-token");
    expect(folderId).toBe("existing-folder-id");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("creates Creators-Data folder if missing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "newly-created-folder-id" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const folderId = await ensureGoogleDriveCreatorsFolder("fake-token");
    expect(folderId).toBe("newly-created-folder-id");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uploads file to Google Drive and parses fileId", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "gdrive-file-123" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const storage = new GoogleDriveAssetStorage({
      getAccessToken: async () => "test-token",
      rootFolderId: "root-folder-abc",
    });

    const stored = await storage.put(
      "org/1/assets/test.png",
      Buffer.from("image-bytes"),
      "image/png",
    );
    expect(stored.byteSize).toBe(11n);
    expect(stored.externalFileId).toBe("gdrive-file-123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("BYOS OneDrive", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("builds correct OneDrive OAuth URL", () => {
    const url = getOneDriveAuthUrl({
      clientId: "ms-client-123",
      redirectUri: "https://app.com/ms-callback",
      state: "csrf-state-456",
    });
    const parsed = new URL(url);
    expect(parsed.hostname).toBe("login.microsoftonline.com");
    expect(parsed.searchParams.get("client_id")).toBe("ms-client-123");
    expect(parsed.searchParams.get("scope")).toContain("Files.ReadWrite");
  });

  it("creates Creators-Data folder in OneDrive root if not found", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "onedrive-folder-id" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const folderId = await ensureOneDriveCreatorsFolder("fake-token");
    expect(folderId).toBe("onedrive-folder-id");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("extracts direct CDN download URL for zero-bandwidth streaming", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "file-999",
        "@microsoft.graph.downloadUrl":
          "https://public.cdn.onedrive.com/direct-stream.mp4",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const storage = new OneDriveAssetStorage({
      getAccessToken: async () => "test-token",
      rootFolderId: "onedrive-root-id",
    });

    const downloadUrl = await storage.getDirectDownloadUrl(
      "org/1/clip.mp4",
      "file-999",
    );
    expect(downloadUrl).toBe(
      "https://public.cdn.onedrive.com/direct-stream.mp4",
    );
  });
});
