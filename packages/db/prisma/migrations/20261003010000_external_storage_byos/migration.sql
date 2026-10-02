-- External Storage BYOS (Google Drive & OneDrive)
ALTER TABLE `Organization`
  ADD COLUMN `defaultStorageProvider` ENUM('LOCAL', 'S3', 'GOOGLE_DRIVE', 'ONEDRIVE') NOT NULL DEFAULT 'LOCAL';

ALTER TABLE `Asset`
  ADD COLUMN `externalFileId` VARCHAR(191) NULL;

CREATE TABLE `ExternalStorageConfig` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NULL,
  `provider` ENUM('LOCAL', 'S3', 'GOOGLE_DRIVE', 'ONEDRIVE') NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
  `accountEmail` VARCHAR(191) NULL,
  `rootFolderId` VARCHAR(191) NOT NULL,
  `rootFolderName` VARCHAR(191) NOT NULL DEFAULT 'Creators-Data',
  `encryptedRefreshToken` TEXT NOT NULL,
  `encryptedAccessToken` TEXT NULL,
  `accessTokenExpiresAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `ExternalStorageConfig_organizationId_provider_key`(`organizationId`, `provider`),
  INDEX `ExternalStorageConfig_organizationId_idx`(`organizationId`),
  INDEX `ExternalStorageConfig_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ExternalStorageConfig` ADD CONSTRAINT `ExternalStorageConfig_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ExternalStorageConfig` ADD CONSTRAINT `ExternalStorageConfig_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
