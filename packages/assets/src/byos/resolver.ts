import type { PrismaClient } from "@aiwa/db";
import { decryptSecret, encryptSecret } from "../crypto";
import { LocalAssetStorage, type AssetStorage } from "../storage";
import {
  GoogleDriveAssetStorage,
  refreshGoogleDriveAccessToken,
} from "./google-drive";
import { OneDriveAssetStorage, refreshOneDriveAccessToken } from "./onedrive";

export interface StorageResolverOptions {
  storageRoot: string;
  encryptionKey?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  onedriveClientId?: string;
  onedriveClientSecret?: string;
}

type ExternalProvider = "GOOGLE_DRIVE" | "ONEDRIVE";

type RefreshedToken = {
  accessToken: string;
  expiresAt: Date;
  refreshToken?: string;
};

const tokenRefreshes = new Map<string, Promise<RefreshedToken>>();

export async function resolveExternalStorage(
  db: PrismaClient,
  organizationId: string,
  provider: ExternalProvider,
  options: StorageResolverOptions,
): Promise<AssetStorage> {
  if (!options.encryptionKey) {
    throw new Error("External storage encryption key is not configured.");
  }

  const config = await db.externalStorageConfig.findUnique({
    where: { organizationId_provider: { organizationId, provider } },
  });
  if (!config || config.status !== "ACTIVE") {
    throw new Error(`External storage provider ${provider} is not connected.`);
  }

  // Validate the long-lived credential before returning a storage client.
  decryptSecret(config.encryptedRefreshToken, options.encryptionKey);
  let cachedAccessToken = config.encryptedAccessToken
    ? (() => {
        try {
          return decryptSecret(
            config.encryptedAccessToken!,
            options.encryptionKey!,
          );
        } catch {
          return null;
        }
      })()
    : null;
  let cachedAccessTokenExpiresAt = config.accessTokenExpiresAt;

  const getAccessToken = async (): Promise<string> => {
    if (
      cachedAccessToken &&
      cachedAccessTokenExpiresAt &&
      cachedAccessTokenExpiresAt.getTime() > Date.now() + 60_000
    )
      return cachedAccessToken;

    let refresh = tokenRefreshes.get(config.id);
    if (!refresh) {
      const createdRefresh = db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM ExternalStorageConfig WHERE id = ${config.id} FOR UPDATE`;
          const fresh = await tx.externalStorageConfig.findUnique({
            where: { id: config.id },
          });
          if (!fresh || fresh.status !== "ACTIVE")
            throw new Error(
              `External storage provider ${provider} is not connected.`,
            );
          if (
            fresh.encryptedAccessToken &&
            fresh.accessTokenExpiresAt &&
            fresh.accessTokenExpiresAt.getTime() > Date.now() + 60_000
          ) {
            return {
              accessToken: decryptSecret(
                fresh.encryptedAccessToken,
                options.encryptionKey!,
              ),
              expiresAt: fresh.accessTokenExpiresAt,
              refreshToken: decryptSecret(
                fresh.encryptedRefreshToken,
                options.encryptionKey!,
              ),
            };
          }

          const currentRefreshToken = decryptSecret(
            fresh.encryptedRefreshToken,
            options.encryptionKey!,
          );
          const refreshed =
            provider === "GOOGLE_DRIVE"
              ? await refreshGoogleDriveAccessToken({
                  clientId: options.googleClientId!,
                  clientSecret: options.googleClientSecret!,
                  refreshToken: currentRefreshToken,
                })
              : await refreshOneDriveAccessToken({
                  clientId: options.onedriveClientId!,
                  clientSecret: options.onedriveClientSecret!,
                  refreshToken: currentRefreshToken,
                });
          const expiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);
          const replacementRefreshToken =
            "refreshToken" in refreshed &&
            typeof refreshed.refreshToken === "string" &&
            refreshed.refreshToken
              ? refreshed.refreshToken
              : currentRefreshToken;
          await tx.externalStorageConfig.update({
            where: { id: fresh.id },
            data: {
              encryptedAccessToken: encryptSecret(
                refreshed.accessToken,
                options.encryptionKey!,
              ),
              accessTokenExpiresAt: expiresAt,
              encryptedRefreshToken: encryptSecret(
                replacementRefreshToken,
                options.encryptionKey!,
              ),
            },
          });
          return {
            accessToken: refreshed.accessToken,
            expiresAt,
            refreshToken: replacementRefreshToken,
          };
        },
        { isolationLevel: "ReadCommitted", timeout: 15_000 },
      );
      tokenRefreshes.set(config.id, createdRefresh);
      void createdRefresh.then(
        () => {
          if (tokenRefreshes.get(config.id) === createdRefresh)
            tokenRefreshes.delete(config.id);
        },
        () => {
          if (tokenRefreshes.get(config.id) === createdRefresh)
            tokenRefreshes.delete(config.id);
        },
      );
      refresh = createdRefresh;
    }
    const resolved = await refresh;
    cachedAccessToken = resolved.accessToken;
    cachedAccessTokenExpiresAt = resolved.expiresAt;
    return resolved.accessToken;
  };

  if (provider === "GOOGLE_DRIVE") {
    if (!options.googleClientId || !options.googleClientSecret) {
      throw new Error("Google Drive OAuth is not configured.");
    }

    return new GoogleDriveAssetStorage({
      getAccessToken,
      rootFolderId: config.rootFolderId,
    });
  }

  if (!options.onedriveClientId || !options.onedriveClientSecret) {
    throw new Error("OneDrive OAuth is not configured.");
  }

  return new OneDriveAssetStorage({
    getAccessToken,
    rootFolderId: config.rootFolderId,
  });
}

export async function resolveOrganizationStorage(
  db: PrismaClient,
  organizationId: string,
  options: StorageResolverOptions,
): Promise<AssetStorage> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { defaultStorageProvider: true },
  });

  const provider = org?.defaultStorageProvider ?? "LOCAL";
  if (provider === "LOCAL") {
    return new LocalAssetStorage(options.storageRoot);
  }
  if (provider === "GOOGLE_DRIVE" || provider === "ONEDRIVE") {
    return resolveExternalStorage(db, organizationId, provider, options);
  }

  throw new Error(`Storage provider ${provider} is not implemented.`);
}

export async function resolveAssetStorageForAsset(
  db: PrismaClient,
  asset: { organizationId: string; storageProvider: string },
  options: StorageResolverOptions,
): Promise<AssetStorage> {
  if (asset.storageProvider === "LOCAL") {
    return new LocalAssetStorage(options.storageRoot);
  }
  if (
    asset.storageProvider === "GOOGLE_DRIVE" ||
    asset.storageProvider === "ONEDRIVE"
  ) {
    return resolveExternalStorage(
      db,
      asset.organizationId,
      asset.storageProvider,
      options,
    );
  }

  throw new Error(
    `Storage provider ${asset.storageProvider} is not implemented.`,
  );
}
