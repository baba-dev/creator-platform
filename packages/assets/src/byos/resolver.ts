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
  encryptionKey: string;
  googleClientId?: string;
  googleClientSecret?: string;
  onedriveClientId?: string;
  onedriveClientSecret?: string;
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

  if (
    provider === "GOOGLE_DRIVE" &&
    options.googleClientId &&
    options.googleClientSecret
  ) {
    const config = await db.externalStorageConfig.findUnique({
      where: {
        organizationId_provider: {
          organizationId,
          provider: "GOOGLE_DRIVE",
        },
      },
    });

    if (config && config.status === "ACTIVE") {
      const refreshToken = decryptSecret(
        config.encryptedRefreshToken,
        options.encryptionKey,
      );

      const getAccessToken = async (): Promise<string> => {
        // If existing access token is valid for at least 60 more seconds, reuse it
        if (
          config.encryptedAccessToken &&
          config.accessTokenExpiresAt &&
          config.accessTokenExpiresAt.getTime() > Date.now() + 60_000
        ) {
          try {
            return decryptSecret(
              config.encryptedAccessToken,
              options.encryptionKey,
            );
          } catch {
            // Decryption failed, proceed to refresh
          }
        }

        const refreshed = await refreshGoogleDriveAccessToken({
          clientId: options.googleClientId!,
          clientSecret: options.googleClientSecret!,
          refreshToken,
        });

        const expiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);
        const encryptedAccessToken = encryptSecret(
          refreshed.accessToken,
          options.encryptionKey,
        );

        await db.externalStorageConfig
          .update({
            where: { id: config.id },
            data: {
              encryptedAccessToken,
              accessTokenExpiresAt: expiresAt,
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
  }

  if (
    provider === "ONEDRIVE" &&
    options.onedriveClientId &&
    options.onedriveClientSecret
  ) {
    const config = await db.externalStorageConfig.findUnique({
      where: {
        organizationId_provider: {
          organizationId,
          provider: "ONEDRIVE",
        },
      },
    });

    if (config && config.status === "ACTIVE") {
      const refreshToken = decryptSecret(
        config.encryptedRefreshToken,
        options.encryptionKey,
      );

      const getAccessToken = async (): Promise<string> => {
        if (
          config.encryptedAccessToken &&
          config.accessTokenExpiresAt &&
          config.accessTokenExpiresAt.getTime() > Date.now() + 60_000
        ) {
          try {
            return decryptSecret(
              config.encryptedAccessToken,
              options.encryptionKey,
            );
          } catch {
            // Refresh
          }
        }

        const refreshed = await refreshOneDriveAccessToken({
          clientId: options.onedriveClientId!,
          clientSecret: options.onedriveClientSecret!,
          refreshToken,
        });

        const expiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);
        const encryptedAccessToken = encryptSecret(
          refreshed.accessToken,
          options.encryptionKey,
        );

        await db.externalStorageConfig
          .update({
            where: { id: config.id },
            data: {
              encryptedAccessToken,
              accessTokenExpiresAt: expiresAt,
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
  }

  return new LocalAssetStorage(options.storageRoot);
}

export async function resolveAssetStorageForAsset(
  db: PrismaClient,
  asset: { organizationId: string; storageProvider: string },
  options: StorageResolverOptions,
): Promise<AssetStorage> {
  if (
    asset.storageProvider === "GOOGLE_DRIVE" ||
    asset.storageProvider === "ONEDRIVE"
  ) {
    // Resolve external storage for organization
    const storage = await resolveOrganizationStorage(
      db,
      asset.organizationId,
      options,
    );
    if (storage.provider === asset.storageProvider) {
      return storage;
    }
  }

  return new LocalAssetStorage(options.storageRoot);
}
