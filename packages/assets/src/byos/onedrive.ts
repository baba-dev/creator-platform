import { z } from "zod";
import type { StorageQuota } from "../storage";
import { byteValue, quotaFromBytes } from "./quota";
import { createHash } from "node:crypto";
import type {
  AssetObjectStat,
  AssetStorage,
  StoredAssetObject,
} from "../storage";

export const ONEDRIVE_FOLDER_NAME = "Creators-Data";
export const ONEDRIVE_OAUTH_SCOPE = "Files.ReadWrite offline_access User.Read";

export interface OneDriveConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function getOneDriveAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  );
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", ONEDRIVE_OAUTH_SCOPE);
  url.searchParams.set("state", input.state);
  return url.toString();
}

export async function exchangeOneDriveCode(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  accountEmail?: string;
}> {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    code: input.code,
    grant_type: "authorization_code",
  });

  const response = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(8000),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OneDrive token exchange failed (${response.status}): ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  if (!data.access_token) {
    throw new Error("Missing access_token in OneDrive response.");
  }
  if (!data.refresh_token) {
    throw new Error("Missing refresh_token in OneDrive response.");
  }

  let accountEmail: string | undefined;
  try {
    const userRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    if (userRes.ok) {
      const userData = (await userRes.json()) as {
        userPrincipalName?: string;
        mail?: string;
      };
      accountEmail = userData.mail || userData.userPrincipalName;
    }
  } catch {
    // Non-fatal
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    accountEmail,
  };
}

export async function refreshOneDriveAccessToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<{ accessToken: string; expiresIn: number }> {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(8000),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OneDrive token refresh failed (${response.status}): ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
}

export async function ensureOneDriveCreatorsFolder(
  accessToken: string,
): Promise<string> {
  const checkUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${ONEDRIVE_FOLDER_NAME}`;
  const checkRes = await fetch(checkUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (checkRes.ok) {
    const data = (await checkRes.json()) as { id: string };
    return data.id;
  }

  // Create folder
  const createRes = await fetch(
    "https://graph.microsoft.com/v1.0/me/drive/root/children",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: ONEDRIVE_FOLDER_NAME,
        folder: {},
        "@microsoft.graph.conflictBehavior": "rename",
      }),
    },
  );

  if (!createRes.ok) {
    const errorText = await createRes.text();
    throw new Error(
      `OneDrive Creators-Data folder creation failed: ${errorText}`,
    );
  }

  const createData = (await createRes.json()) as { id: string };
  return createData.id;
}

export class OneDriveAssetStorage implements AssetStorage {
  readonly provider = "ONEDRIVE" as const;

  constructor(
    private readonly options: {
      getAccessToken: () => Promise<string>;
      rootFolderId: string;
    },
  ) {}

  async getQuota(): Promise<StorageQuota> {
    const token = await this.options.getAccessToken();
    const response = await fetch(
      "https://graph.microsoft.com/v1.0/me/drive?$select=quota",
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok)
      throw new Error("Storage quota is temporarily unavailable.");
    const data = z
      .object({
        quota: z.object({
          total: byteValue.optional(),
          used: byteValue,
          remaining: byteValue.optional(),
        }),
      })
      .parse(await response.json());
    const { total, used, remaining } = data.quota;
    return quotaFromBytes(total, used, remaining);
  }

  private sanitizeFilename(objectKey: string): string {
    return objectKey.replaceAll(/[\\/]/g, "_");
  }

  private async findFileId(objectKey: string, token: string): Promise<string> {
    const safeName = this.sanitizeFilename(objectKey);
    const searchUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${this.options.rootFolderId}:/${encodeURIComponent(safeName)}`;

    const res = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(
        `OneDrive file '${objectKey}' not found (${res.status}).`,
      );
    }
    const data = (await res.json()) as { id: string };
    return data.id;
  }

  async put(
    objectKey: string,
    bytes: Buffer,
    mimeType = "application/octet-stream",
  ): Promise<StoredAssetObject> {
    const token = await this.options.getAccessToken();
    const safeName = this.sanitizeFilename(objectKey);

    // Direct content PUT works for files up to 250MB via Microsoft Graph
    const uploadUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${this.options.rootFolderId}:/${encodeURIComponent(safeName)}:/content`;

    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": mimeType,
      },
      body: new Uint8Array(bytes),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`OneDrive upload failed (${res.status}): ${errorText}`);
    }

    const data = (await res.json()) as { id: string; size?: number };
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    return {
      byteSize: BigInt(bytes.byteLength),
      sha256,
      externalFileId: data.id,
    };
  }

  async read(objectKey: string, externalFileId?: string): Promise<Buffer> {
    const token = await this.options.getAccessToken();
    const fileId = externalFileId ?? (await this.findFileId(objectKey, token));

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!res.ok) {
      throw new Error(
        `Failed to read asset from OneDrive (${res.status}): ${await res.text()}`,
      );
    }

    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  }

  async readRange(
    objectKey: string,
    start: number,
    end: number,
    externalFileId?: string,
  ): Promise<Buffer> {
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < start
    ) {
      throw new RangeError("Invalid asset byte range.");
    }

    const token = await this.options.getAccessToken();
    const fileId = externalFileId ?? (await this.findFileId(objectKey, token));

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Range: `bytes=${start}-${end}`,
        },
      },
    );

    if (!res.ok && res.status !== 206) {
      throw new Error(
        `Failed range read from OneDrive (${res.status}): ${await res.text()}`,
      );
    }

    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  }

  async stat(
    objectKey: string,
    externalFileId?: string,
  ): Promise<AssetObjectStat> {
    const token = await this.options.getAccessToken();
    const fileId = externalFileId ?? (await this.findFileId(objectKey, token));

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!res.ok) {
      throw new Error(
        `Failed to stat OneDrive file (${res.status}): ${await res.text()}`,
      );
    }

    const data = (await res.json()) as { size?: number };
    const byteSize = BigInt(data.size ?? 0);
    return { byteSize };
  }

  async delete(objectKey: string, externalFileId?: string): Promise<void> {
    const token = await this.options.getAccessToken();
    let fileId = externalFileId;
    if (!fileId) {
      try {
        fileId = await this.findFileId(objectKey, token);
      } catch {
        return;
      }
    }

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!res.ok && res.status !== 404) {
      throw new Error(
        `Failed to delete OneDrive file (${res.status}): ${await res.text()}`,
      );
    }
  }

  /**
   * Fetches the direct, pre-authenticated Microsoft CDN download URL
   * suitable for 302 redirects to achieve zero-egress streaming.
   */
  async getDirectDownloadUrl(
    objectKey: string,
    externalFileId?: string,
  ): Promise<string | null> {
    const token = await this.options.getAccessToken();
    const fileId = externalFileId ?? (await this.findFileId(objectKey, token));

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}?select=id,@microsoft.graph.downloadUrl`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!res.ok) return null;
    const data = (await res.json()) as {
      "@microsoft.graph.downloadUrl"?: string;
    };
    return data["@microsoft.graph.downloadUrl"] ?? null;
  }
}
