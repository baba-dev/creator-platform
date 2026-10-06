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

  const refreshToken = decryptSecret(
    config.encryptedRefreshToken,
    options.encryptionKey,
  );

  if (provider === "GOOGLE_DRIVE") {
    if (!options.googleClientId || !options.googleClientSecret) {
      throw new Error("Google Drive OAuth is not configured.");
    }

    const getAccessToken = async (): Promise<string> => {
      if (
        config.encryptedAccessToken &&
        config.accessTokenExpiresAt &&
        config.accessTokenExpiresAt.getTime() > Date.now() + 60_000
      ) {
        try {
          return decryptSecret(
            config.encryptedAccessToken,
            options.encryptionKey!,
          );
        } catch {
          // Refresh using the long-lived refresh token below.
        }
      }

      const refreshed = await refreshGoogleDriveAccessToken({
        clientId: options.googleClientId!,
        clientSecret: options.googleClientSecret!,
        refreshToken,
      });
      const encryptedAccessToken = encryptSecret(
        refreshed.accessToken,
        options.encryptionKey!,
      );
      await db.externalStorageConfig
        .update({
          where: { id: config.id },
          data: {
            encryptedAccessToken,
            accessTokenExpiresAt: new Date(
              Date.now() + refreshed.expiresIn * 1000,
            ),
          },
        })
        .catch(() => undefined);
      return refreshed.accessToken;
    };

    return new GoogleDriveAssetStorage({
      getAccessToken,
      rootFolderId: config.rootFolderId,
    });
  }

  if (!options.onedriveClientId || !options.onedriveClientSecret) {
    throw new Error("OneDrive OAuth is not configured.");
  }

  const getAccessToken = async (): Promise<string> => {
    if (
      config.encryptedAccessToken &&
      config.accessTokenExpiresAt &&
      config.accessTokenExpiresAt.getTime() > Date.now() + 60_000
    ) {
      try {
        return decryptSecret(
          config.encryptedAccessToken,
          options.encryptionKey!,
        );
      } catch {
        // Refresh using the long-lived refresh token below.
      }
    }

    const refreshed = await refreshOneDriveAccessToken({
      clientId: options.onedriveClientId!,
      clientSecret: options.onedriveClientSecret!,
      refreshToken,
    });
    const encryptedAccessToken = encryptSecret(
      refreshed.accessToken,
      options.encryptionKey!,
    );
    await db.externalStorageConfig
      .update({
        where: { id: config.id },
        data: {
          encryptedAccessToken,
          accessTokenExpiresAt: new Date(
            Date.now() + refreshed.expiresIn * 1000,
          ),
        },
      })
      .catch(() => undefined);
    return refreshed.accessToken;
  };

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
