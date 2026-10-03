import { createHash } from "node:crypto";
import type {
  AssetObjectStat,
  AssetStorage,
  StoredAssetObject,
} from "../storage";

export const GOOGLE_DRIVE_FOLDER_NAME = "Creators-Data";
export const GOOGLE_DRIVE_OAUTH_SCOPE =
  "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email";

export interface GoogleDriveConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function getGoogleDriveAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_DRIVE_OAUTH_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", input.state);
  return url.toString();
}

export async function exchangeGoogleDriveCode(input: {
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

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Google token exchange failed (${response.status}): ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  if (!data.access_token) {
    throw new Error("Missing access_token in Google response.");
  }
  if (!data.refresh_token) {
    throw new Error(
      "Missing refresh_token in Google response. Prompt consent required.",
    );
  }

  let accountEmail: string | undefined;
  try {
    const userRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${data.access_token}` },
      },
    );
    if (userRes.ok) {
      const userData = (await userRes.json()) as { email?: string };
      accountEmail = userData.email;
    }
  } catch {
    // Non-fatal if email retrieval fails
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    accountEmail,
  };
}

export async function refreshGoogleDriveAccessToken(input: {
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

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Google token refresh failed (${response.status}): ${errorText}`,
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

export async function ensureGoogleDriveCreatorsFolder(
  accessToken: string,
): Promise<string> {
  const query = `name = '${GOOGLE_DRIVE_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=drive&fields=files(id,name)`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!searchRes.ok) {
    const errorText = await searchRes.text();
    throw new Error(`Google Drive folder search failed: ${errorText}`);
  }

  const searchData = (await searchRes.json()) as {
    files?: { id: string; name: string }[];
  };
  if (
    searchData.files &&
    searchData.files.length > 0 &&
    searchData.files[0]?.id
  ) {
    return searchData.files[0].id;
  }

  // Create folder if not found
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: GOOGLE_DRIVE_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });

  if (!createRes.ok) {
    const errorText = await createRes.text();
    throw new Error(`Google Drive folder creation failed: ${errorText}`);
  }

  const createData = (await createRes.json()) as { id: string };
  return createData.id;
}

export class GoogleDriveAssetStorage implements AssetStorage {
  readonly provider = "GOOGLE_DRIVE" as const;

  constructor(
    private readonly options: {
      getAccessToken: () => Promise<string>;
      rootFolderId: string;
    },
  ) {}

  private sanitizeFilename(objectKey: string): string {
    return objectKey.replaceAll(/[\\/]/g, "_");
  }

  private async findFileId(objectKey: string, token: string): Promise<string> {
    const safeName = this.sanitizeFilename(objectKey);
    const query = `name = '${safeName}' and '${this.options.rootFolderId}' in parents and trashed = false`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=drive&fields=files(id)`;

    const res = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Google Drive file search failed: ${await res.text()}`);
    }
    const data = (await res.json()) as { files?: { id: string }[] };
    const id = data.files?.[0]?.id;
    if (!id) {
      throw new Error(`Google Drive file '${objectKey}' not found.`);
    }
    return id;
  }

  async put(
    objectKey: string,
    bytes: Buffer,
    mimeType = "application/octet-stream",
  ): Promise<StoredAssetObject> {
    const token = await this.options.getAccessToken();
    const safeName = this.sanitizeFilename(objectKey);

    const boundary = "-------BYOS_MULTIPART_BOUNDARY_" + Date.now();
    const metadata = JSON.stringify({
      name: safeName,
      parents: [this.options.rootFolderId],
    });

    const header = Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    );
    const footer = Buffer.from(`\r\n--${boundary}--`);
    const body = Buffer.concat([header, bytes, footer]);

    const res = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,size",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
          "Content-Length": String(body.length),
        },
        body,
      },
    );

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(
        `Google Drive file upload failed (${res.status}): ${errorText}`,
      );
    }

    const data = (await res.json()) as { id: string };
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
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!res.ok) {
      throw new Error(
        `Failed to read asset from Google Drive (${res.status}): ${await res.text()}`,
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
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Range: `bytes=${start}-${end}`,
        },
      },
    );

    if (!res.ok && res.status !== 206) {
      throw new Error(
        `Failed range read from Google Drive (${res.status}): ${await res.text()}`,
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
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=size`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!res.ok) {
      throw new Error(
        `Failed to stat Google Drive file (${res.status}): ${await res.text()}`,
      );
    }

    const data = (await res.json()) as { size?: string };
    const byteSize = BigInt(data.size ?? "0");
    return { byteSize };
  }

  async delete(objectKey: string, externalFileId?: string): Promise<void> {
    const token = await this.options.getAccessToken();
    let fileId = externalFileId;
    if (!fileId) {
      try {
        fileId = await this.findFileId(objectKey, token);
      } catch {
        return; // File already deleted or missing
      }
    }

    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!res.ok && res.status !== 404) {
      throw new Error(
        `Failed to delete Google Drive file (${res.status}): ${await res.text()}`,
      );
    }
  }
}
