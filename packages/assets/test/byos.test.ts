import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@aiwa/db";
import { decryptSecret, encryptSecret } from "../src/crypto";
import { resolveExternalStorage } from "../src/byos/resolver";
import {
  ensureGoogleDriveCreatorsFolder,
  getGoogleDriveAuthUrl,
  GoogleDriveAssetStorage,
} from "../src/byos/google-drive";
import {
  ensureOneDriveCreatorsFolder,
  getOneDriveAuthUrl,
  OneDriveAssetStorage,
  refreshOneDriveAccessToken,
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

  it("returns rotated OneDrive refresh credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "access-next",
          refresh_token: "refresh-next",
          expires_in: 3600,
        }),
      }),
    );
    await expect(
      refreshOneDriveAccessToken({
        clientId: "client",
        clientSecret: "secret",
        refreshToken: "refresh-old",
      }),
    ).resolves.toEqual({
      accessToken: "access-next",
      refreshToken: "refresh-next",
      expiresIn: 3600,
    });
  });

  it("coordinates refreshes and persists a rotated OneDrive token", async () => {
    const encryptionKey = "test-storage-encryption-key";
    const config = {
      id: "storage-one",
      organizationId: "org-one",
      userId: "user-one",
      provider: "ONEDRIVE" as const,
      status: "ACTIVE",
      accountEmail: "owner@example.com",
      rootFolderId: "root-one",
      rootFolderName: "Creators-Data",
      encryptedRefreshToken: encryptSecret("refresh-old", encryptionKey),
      encryptedAccessToken: null as string | null,
      accessTokenExpiresAt: null as Date | null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const update = vi.fn(
      async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(config, data);
        return config;
      },
    );
    const tx = {
      $queryRaw: vi.fn(async () => [{ id: config.id }]),
      externalStorageConfig: {
        findUnique: vi.fn(async () => config),
        update,
      },
    };
    const database = {
      externalStorageConfig: {
        findUnique: vi.fn(async () => config),
      },
      $transaction: async (operation: (client: typeof tx) => unknown) =>
        operation(tx),
    } as unknown as PrismaClient;
    const fetchMock = vi.fn(async (url: string | URL) => {
      if (String(url).includes("/oauth2/v2.0/token"))
        return {
          ok: true,
          json: async () => ({
            access_token: "access-next",
            refresh_token: "refresh-next",
            expires_in: 3600,
          }),
        };
      return {
        ok: true,
        json: async () => ({ quota: { total: 1000, used: 100 } }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const storage = await resolveExternalStorage(
      database,
      config.organizationId,
      "ONEDRIVE",
      {
        storageRoot: "/tmp/assets",
        encryptionKey,
        onedriveClientId: "client",
        onedriveClientSecret: "secret",
      },
    );
    await Promise.all([storage.getQuota!(), storage.getQuota!()]);

    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).includes("/oauth2/v2.0/token"),
      ),
    ).toHaveLength(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(decryptSecret(config.encryptedRefreshToken, encryptionKey)).toBe(
      "refresh-next",
    );
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
