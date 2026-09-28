-- P0 asset-management foundation.
-- This migration is additive and keeps existing generated-media object keys stable.
-- Existing rows are classified from their persisted MIME type and attributed to
-- their current storage owner so generation jobs remain backward compatible.

ALTER TABLE `Asset`
  MODIFY COLUMN `status` ENUM('PENDING', 'READY', 'QUARANTINED', 'DELETED', 'PURGED') NOT NULL DEFAULT 'PENDING',
  ADD COLUMN `createdById` VARCHAR(191) NULL,
  ADD COLUMN `uploadedById` VARCHAR(191) NULL,
  ADD COLUMN `mediaKind` ENUM('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'OTHER') NOT NULL DEFAULT 'OTHER',
  ADD COLUMN `sourceType` ENUM('GENERATED', 'UPLOADED', 'IMPORTED', 'DERIVED', 'EXTERNAL') NOT NULL DEFAULT 'GENERATED',
  ADD COLUMN `storageProvider` ENUM('LOCAL', 'S3', 'GOOGLE_DRIVE', 'ONEDRIVE') NOT NULL DEFAULT 'LOCAL',
  ADD COLUMN `name` VARCHAR(191) NULL,
  ADD COLUMN `originalFilename` VARCHAR(191) NULL,
  ADD COLUMN `deletedAt` DATETIME(3) NULL,
  ADD COLUMN `purgeAfter` DATETIME(3) NULL;

UPDATE `Asset`
SET `createdById` = `storageOwnerUserId`,
    `mediaKind` = CASE
      WHEN `mimeType` LIKE 'image/%' THEN 'IMAGE'
      WHEN `mimeType` LIKE 'video/%' THEN 'VIDEO'
      WHEN `mimeType` LIKE 'audio/%' THEN 'AUDIO'
      WHEN `mimeType` IN ('application/pdf', 'text/plain') THEN 'DOCUMENT'
      ELSE 'OTHER'
    END,
    `name` = CONCAT('Generated ', LOWER(
      CASE
        WHEN `mimeType` LIKE 'image/%' THEN 'image'
        WHEN `mimeType` LIKE 'video/%' THEN 'video'
        WHEN `mimeType` LIKE 'audio/%' THEN 'audio'
        ELSE 'asset'
      END
    ))
WHERE `createdById` IS NULL;

CREATE TABLE `AssetVariant` (
  `id` VARCHAR(191) NOT NULL,
  `assetId` VARCHAR(191) NOT NULL,
  `kind` ENUM('THUMBNAIL', 'PREVIEW', 'POSTER') NOT NULL,
  `storageProvider` ENUM('LOCAL', 'S3', 'GOOGLE_DRIVE', 'ONEDRIVE') NOT NULL DEFAULT 'LOCAL',
  `objectKey` VARCHAR(191) NOT NULL,
  `mimeType` VARCHAR(191) NOT NULL,
  `byteSize` BIGINT NOT NULL,
  `sha256` VARCHAR(191) NULL,
  `width` INTEGER NULL,
  `height` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `AssetVariant_objectKey_key`(`objectKey`),
  UNIQUE INDEX `AssetVariant_assetId_kind_key`(`assetId`, `kind`),
  INDEX `AssetVariant_assetId_idx`(`assetId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AssetStorageUsage` (
  `organizationId` VARCHAR(191) NOT NULL,
  `usedBytes` BIGINT NOT NULL DEFAULT 0,
  `reservedBytes` BIGINT NOT NULL DEFAULT 0,
  `readyAssetCount` INTEGER NOT NULL DEFAULT 0,
  `version` INTEGER NOT NULL DEFAULT 0,
  `reconciledAt` DATETIME(3) NULL,
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`organizationId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `AssetStorageUsage`
  (`organizationId`, `usedBytes`, `reservedBytes`, `readyAssetCount`, `version`, `reconciledAt`, `updatedAt`)
SELECT
  `organizationId`,
  COALESCE(SUM(CASE WHEN `status` = 'READY' THEN `byteSize` ELSE 0 END), 0),
  COALESCE(SUM(CASE WHEN `status` = 'PENDING' THEN `byteSize` ELSE 0 END), 0),
  SUM(CASE WHEN `status` = 'READY' THEN 1 ELSE 0 END),
  0,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `Asset`
GROUP BY `organizationId`;

CREATE INDEX `Asset_organizationId_mediaKind_status_createdAt_idx`
  ON `Asset`(`organizationId`, `mediaKind`, `status`, `createdAt`);
CREATE INDEX `Asset_organizationId_sourceType_status_createdAt_idx`
  ON `Asset`(`organizationId`, `sourceType`, `status`, `createdAt`);
CREATE INDEX `Asset_projectId_status_createdAt_idx`
  ON `Asset`(`projectId`, `status`, `createdAt`);
CREATE INDEX `Asset_status_purgeAfter_idx`
  ON `Asset`(`status`, `purgeAfter`);
CREATE INDEX `Asset_organizationId_sha256_idx`
  ON `Asset`(`organizationId`, `sha256`);

ALTER TABLE `Asset`
  ADD CONSTRAINT `Asset_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `Asset_uploadedById_fkey`
    FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `AssetVariant`
  ADD CONSTRAINT `AssetVariant_assetId_fkey`
    FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `AssetStorageUsage`
  ADD CONSTRAINT `AssetStorageUsage_organizationId_fkey`
    FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
